import { connect } from "https://denopkg.com/keroxp/deno-redis/redis.ts";
import { serve, ServerRequest } from "https://deno.land/std/http/server.ts";
import { runTimings } from "./curl.ts";
const env = Deno.env();
const region = env.FLY_REGION || "local";

const redisUrl = new URL(env.FLY_REDIS_CACHE_URL || "redis://127.0.0.1:6379");

console.log("Connection to redis:", redisUrl.hostname, redisUrl.port);

const [globalRedis, localRedis] = await Promise.all([
    connect({
        hostname: redisUrl.hostname,
        port: redisUrl.port,
        //db: 1
    }),
    connect({
        hostname: redisUrl.hostname,
        port: redisUrl.port,
        //db: 0
    })
])
if(redisUrl.password){
    console.log("Authenticating with redis")
    await Promise.all([
        localRedis.auth(redisUrl.password),
        globalRedis.auth(redisUrl.password)
    ])
}else{
    console.log("No redis password found", redisUrl)
}
globalRedis.select(1); // global redis uses db 1
registerIP();

//@ts-ignore
setInterval(registerIP, 7000);

const s = serve({
    hostname: "[::]",
    port: 8080
});
//const sv6 = serve("::8080")
console.log("Listening for HTTP requests")
for await (const req of s) {
    handleRequest(req);
}

async function registerIP(region?: string){
    const env = Deno.env();
    if(!region){
        region = env.FLY_REGION || "local";
    }
    const ip = env.FLY_PUBLIC_IP || "127.0.0.1";
    console.log(`Registering ip for ${region}:`, ip)
    await Promise.all([
        localRedis.set(`region:${region}`, ip),
        globalRedis.set(`region:${region}`, ip),
        localRedis.expire(`region:${region}`, 10),
        globalRedis.expire(`region:${region}`, 10),

    ])
    if(region === "local"){
        await registerIP("fake-remote")
    }
}
async function availableRegionKeys(){
    return localRedis.keys("region:*");
}

async function availableRegionAddresses(){
    const keys = await availableRegionKeys();
    return Promise.all(
        keys.map(async function(k){
            console.log("getting:", k)
            const addr = await localRedis.get(k);
            return [k, addr];
        })
    )
}
async function handleRequest(req: ServerRequest){
    if(env.CURL_SECRET !== req.headers.get("Authorization")){
        req.respond({status: 401, body: new TextEncoder().encode("no yuo")});
        return;
    }
    console.log(req.method, req.url)
    if(req.method === "GET" && req.url === "/info"){
        const regions = await availableRegionAddresses();
        const body = JSON.stringify(regions);

        req.respond({status: 200, body: new TextEncoder().encode(body)});
        return;
    }
    if(req.method === "POST" && (req.url === "/curl" || req.url === "/curl/local" || req.url == "/timings/local" || req.url === "/timings")){
        const raw = await Deno.readAll(req.body);
        const txt = new TextDecoder().decode(raw)
        console.log(txt)
        const body = JSON.parse(txt);
        const requestedRegion = body.region;
        if(req.url === "/curl/local"){
            const args = body.args
            args.unshift("curl")

            const curl = Deno.run({
                args: args,
                stdout: "piped",
                stderr: "piped"
            })
            req.respond({ body: curl.stdout, headers: new Headers({ "From-Region": region })})
            await curl.status();
        }else if(req.url === "/timings/local"){
            console.log("Running timings")
            const timings = await runTimings(body.url)
            req.respond({body: new TextEncoder().encode(JSON.stringify(timings))})
        }else if(req.url === "/curl" || req.url === "/timings"){
            // proxy to other region
            console.log("Trying to curl through:", requestedRegion);
            let target = await localRedis.get(`region:${requestedRegion}`);
            console.log("Remote curl", `http://${target}:8080${req.url}/local`)
            if(!requestedRegion || !target || target.length === 0){
                req.respond({status: 404, body: new TextEncoder().encode(`Region not available: ${requestedRegion}`)});
                return;
            }
            if(target.includes(':')){
                //ipv6
                target = `[${target}]`;
            }
            try{
                const headers = req.headers;
                const resp = await fetch(`http://${target}:8080${req.url}/local`, { method: "POST", body: raw, headers: headers})
                resp.headers.set("Fly-Region", region)
                req.respond({body: resp.body, headers: resp.headers});
            }catch(e){
                console.error(e);
                req.respond({body: new TextEncoder().encode(e.message), status: 500})
            }
        }else{
            req.respond({ status: 404, body: new TextEncoder().encode("Not found\n") });
        }
    }else{
        req.respond({status: 404, body: "wat"})
    }
}