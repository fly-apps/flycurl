import { serve, ServerRequest } from "https://deno.land/std/http/server.ts";
import { runTimings } from "./curl.ts";
const region = Deno.env.get("FLY_REGION") || "local";
const authSecret = Deno.env.get("CURL_SECRET");

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
    if(req.method === "OPTIONS"){
        const h = new Headers({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization,DNT,User-Agent,X-Requested-With,Content-Type'
        })
        req.respond({headers: h, body: ""});
        return;
        // add_header 'Access-Control-Allow-Origin' '*';
        // add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        // #
        // # Custom headers and headers various browsers *should* be OK with but aren't
        // #
        // add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
        // #
    }
    if(authSecret && authSecret !== req.headers.get("Authorization")){
        req.respond({status: 401, body: new TextEncoder().encode("no yuo")});
        return;
    }
    console.log(req.method, req.url)
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
                cmd: args,
                stdout: "piped",
                stderr: "piped"
            })
            req.respond({ body: curl.stdout, headers: new Headers({ "From-Region": region })})
            await curl.status();
        }else if(req.url === "/timings/local"){
            console.log("Running timings")
            const timings = await runTimings(body.url)
            const h = new Headers({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization,DNT,User-Agent,X-Requested-With,Content-Type'
            })
            req.respond({headers: h, body: new TextEncoder().encode(JSON.stringify(timings))})
        }else if(req.url === "/curl" || req.url === "/timings"){
            // proxy to other region
            console.log("Trying to curl through:", requestedRegion);
            console.log("Remote curl", `http://${requestedRegion}.curl.internal:8080${req.url}/local`)
            if(!requestedRegion){
                req.respond({status: 404, body: new TextEncoder().encode(`Region not available: ${requestedRegion}`)});
                return;
            }
            try{
                const headers = req.headers;
                const resp = await fetch(`http://${requestedRegion}.curl.internal:8080${req.url}/local`, { method: "POST", body: raw, headers: headers})
                const body = new Uint8Array(await resp.arrayBuffer());
                resp.headers.set("Fly-Region", requestedRegion)
                req.respond({body, headers: resp.headers});
            }catch(e){
                console.error(e);
                req.respond({body: new TextEncoder().encode(`${requestedRegion} temporarily unavailable`)})
                req.respond({body: new TextEncoder().encode(`Region not available: ${requestedRegion}`), status: 404})
            }
        }else{
            req.respond({ status: 404, body: new TextEncoder().encode("Not found\n") });
        }
    }else{
        req.respond({status: 404, body: "wat"})
    }
}