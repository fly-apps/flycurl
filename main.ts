import { oak } from "./deps.ts";
import { curl, proxyToRegion, timings } from "./curl.ts";

const { Application, Router } = oak;
const region = Deno.env.get("FLY_REGION") || "local";
const authSecret = Deno.env.get("CURL_SECRET");
const unsafeAuthSecret = Deno.env.get("UNSAFE_SECRET");

type authType = undefined | "allowSafe" | "allowUnsafe";
interface CurlState {
  authType?: authType;
}
const initialState: CurlState = {};

class AuthError extends Error {
  constructor(public readonly require: authType) {
    super(`requires ${require} permission`);
  }
}

const app = new Application({ proxy: true, state: initialState });

const router = new Router();
router
  .post("/curl", (ctx) => {
    return proxyToRegion(ctx.request, ctx.response);
  })
  .post("/timings", (ctx) => {
    return proxyToRegion(ctx.request, ctx.response);
  })
  .post("/curl/local", async (ctx) => {
    if (ctx.state.authType !== "allowUnsafe") {
      throw new AuthError("allowUnsafe");
    }
    const body = await ctx.request.body({ type: "json" }).value;
    const args = body.args;

    if (!(args instanceof Array) || args.length < 1) {
      throw "No args found";
    }
    const result = curl(args);

    ctx.response.headers.set("From-Region", region);
    ctx.response.body = result.stdout;

    await result.process.status();
  })
  .post("/timings/local", async (ctx) => {
    const body = await ctx.request.body({ type: "json" }).value;
    console.log("Running timings");
    const result = await timings(body);
    const h = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization,DNT,User-Agent,X-Requested-With,Content-Type",
    });
    ctx.response.headers = h;
    ctx.response.body = JSON.stringify(result);
  })
  .get("/", (context) => {
    context.response.body = "Hello world!";
  });

// auth
app.use(async (ctx, next) => {
  if (
    unsafeAuthSecret &&
    unsafeAuthSecret === ctx.request.headers.get("Authorizaiton")
  ) {
    ctx.state.authType = "allowUnsafe";
  }
  if (!authSecret || authSecret === ctx.request.headers.get("Authorization")) {
    ctx.state.authType = "allowSafe";
  }

  try {
    if (!ctx.state.authType) {
      throw new AuthError("allowSafe");
    }
    await next();
  } catch (err) {
    if (err instanceof AuthError) {
      ctx.response.status = 401;
      ctx.response.body = `${ctx.request.url.pathname} requires auth`;
    }
  }
});

// Logger
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(
    `${ctx.request.ip} - ${ctx.request.method} ${ctx.request.url} - ${rt}`,
  );
});

// Timing
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Listening on port 8080");
await app.listen({ hostname: "[::]", port: 8080 });
