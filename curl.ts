const metricsNumeric = ["http_code", "speed_download", "time_total", "time_namelookup", "time_connect", "time_pretransfer", "time_appconnect", "time_starttransfer"].map(function(n){
    return `"${n}":%{${n}}`
}).join(",")

const metricsString = ["http_version", "remote_ip", "scheme"].map(function(n){
    return `"${n}":"%{${n}}"`
})
const metricsFormat = "{" + [metricsNumeric, metricsString].join(",") + "}";
const env = Deno.env();
const region = env.FLY_REGION || "local";
export async function runTimings(url: string){
    const args = [
        "curl",
        "-D",
        "-",
        "-o",
        "/dev/null",
        "-sS",
        '-k',
        '-w',
        metricsFormat,
        url
    ]
    console.debug('args:', args)

    const cmd = Deno.run({
        cmd: args,
        stdout: "piped",
        stderr: "piped"
    });

    const decoder = new TextDecoder();
    const [cmdStatus, stdoutBuf, stderrBuf] = await Promise.all([
        cmd.status(),
        cmd.output(),
        cmd.stderrOutput()
    ]);


    if(cmdStatus.code && cmdStatus.code > 0){
        //shitballs
        const err = stderrBuf.length > 0 ?
            decoder.decode(stderrBuf) :
            `Error: curl exited with code ${cmdStatus.code}`;
        throw new Error(err);
    }

    const stdout = decoder.decode(stdoutBuf);
    //console.debug("stdout:", stdout);
    

    const chunks = stdout.split("\r\n\r\n")
    //const headers = chunks[0].split("\r\n")
    //const [proto, _] = headers.shift().split(" ", 2)
    const data = chunks[1];

    //console.debug(proto, data)
    const resp = JSON.parse(data);
    resp['region'] = region;
    return resp;
}