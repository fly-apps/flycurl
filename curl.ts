import { oak } from "./deps.ts";

const metricsNumeric = [
  "http_code",
  "speed_download",
  "time_total",
  "time_namelookup",
  "time_connect",
  "time_pretransfer",
  "time_appconnect",
  "time_starttransfer",
].map(function (n) {
  return `"${n}":%{${n}}`;
}).join(",");

const metricsString = ["http_version", "remote_ip", "scheme"].map(function (n) {
  return `"${n}":"%{${n}}"`;
});
const metricsFormat = "{" + [metricsNumeric, metricsString].join(",") + "}";
const region = Deno.env.get("FLY_REGION") || "local";

export async function timings(params: any) {
  const url = params.url;
  if (typeof url !== "string" || url.length < 10) {
    throw `Invalid url: ${url}`;
  }
  const args = [
    "curl",
    "-D",
    "-",
    "-o",
    "/dev/null",
    "-sS",
    "-k",
    "-w",
    metricsFormat,
    url,
  ];
  console.debug("args:", args);

  const cmd = Deno.run({
    cmd: args,
    stdout: "piped",
    stderr: "piped",
  });

  const decoder = new TextDecoder();
  const [cmdStatus, stdoutBuf, stderrBuf] = await Promise.all([
    cmd.status(),
    cmd.output(),
    cmd.stderrOutput(),
  ]);

  if (cmdStatus.code && cmdStatus.code > 0) {
    //shitballs
    const err = stderrBuf.length > 0
      ? decoder.decode(stderrBuf)
      : `Error: curl exited with code ${cmdStatus.code}`;
    throw new Error(err);
  }

  const stdout = decoder.decode(stdoutBuf);
  //console.debug("stdout:", stdout);

  const chunks = stdout.split("\r\n\r\n");
  //const headers = chunks[0].split("\r\n")
  //const [proto, _] = headers.shift().split(" ", 2)
  const data = chunks[1];

  //console.debug(proto, data)
  const resp = JSON.parse(data);
  resp["region"] = region;
  return resp;
}

export function curl(args: string[]) {
  args.unshift("curl");

  const curl = Deno.run({
    cmd: args,
    stdout: "piped",
    stderr: "piped",
  });

  const s = curl.status();

  s.finally(() => curl.close());

  return {
    stdout: curl.stdout,
    stderr: curl.stderr,
    region: region,
    process: curl,
  };
}

export async function proxyToRegion(
  request: oak.Request,
  response: oak.Response,
) {
  const body = await request.body({ type: "json" }).value;

  const requestedRegion = body.region;

  if (!requestedRegion || typeof requestedRegion !== "string") {
    console.error("No region specified");
    throw "Must specify a region";
  }
  // proxy to other region
  console.log("Trying to curl through:", requestedRegion);
  console.log(
    "Remote curl",
    `http://${requestedRegion}.curl.internal:8080${request.url.pathname}/local`,
  );
  if (!requestedRegion) {
    response.status = 404;
    response.body = `Region not available: ${requestedRegion}`;

    return;
  }
  try {
    const headers = request.headers;
    const resp = await fetch(
      `http://${requestedRegion}.curl.internal:8080${request.url.pathname}/local`,
      { method: "POST", body: JSON.stringify(body), headers: headers },
    );
    headers.set("Fly-Region", requestedRegion);
    response.status = resp.status;
    response.body = resp.body;
    response.headers = resp.headers;
  } catch (e) {
    console.error(e);
    response.status = 404;
    response.body = `Region not available: ${requestedRegion}`;
  }
}
