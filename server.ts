import { connect } from "https://denopkg.com/keroxp/deno-redis/redis.ts";
import { serve, ServerRequest } from "https://deno.land/std/http/server.ts";

const env = Deno.env();
const region = env.FLY_REGION || "local";
const ip = env.FLY_PUBLIC_IP || "127.0.0.1";

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
await globalRedis.select(1); // global redis uses db 1

console.log(`Registering ip for ${region}:`, ip)
await Promise.all([
    localRedis.set(`region:${region}`, ip),
    globalRedis.set(`region:${region}`, ip)
])

const s = serve({
    hostname: "[::]",
    port: 8080
});
//const sv6 = serve("::8080")
console.log("Listening for HTTP requests")
for await (const req of s) {
    handleRequest(req);
}

async function handleRequest(req: ServerRequest){
    console.log(req.method, req.url)
    if(req.method === "POST" && (req.url === "/curl" || req.url === "/curl/local")){
        const raw = await Deno.readAll(req.body);
        const body = JSON.parse(new TextDecoder().decode(raw));
        const requestedRegion = body.region;
        if(req.url === "/curl/local"){
            const url = new URL(body.url).toString();

            const curl = Deno.run({
                args: [
                    "curl", "-D", "-", "-sS", "-o", "/dev/null", url
                ],
                stdout: "piped",
                stderr: "piped"
            })
            req.respond({ body: curl.stdout, headers: new Headers({ "From-Region": region})})
            await curl.status();
        }else if(req.url === "/curl"){
            // proxy to other region
            console.log("Trying to curl through:", requestedRegion);
            let target = await localRedis.get(`region:${requestedRegion}`);
            console.log("Remote curl", `http://${target}:8080/curl/local`)
            if(!requestedRegion || !target || target.length === 0){
                req.respond({status: 404, body: new TextEncoder().encode(`Region not available: ${requestedRegion}`)});
                return;
            }
            if(target.includes(':')){
                //ipv6
                target = `[${target}]`;
            }
            try{
                const resp = await fetch(`http://${target}:8080/curl/local`, { method: "POST", body: raw})
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