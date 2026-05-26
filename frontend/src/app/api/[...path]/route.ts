import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? "";

const HOP_BY_HOP_REQUEST = new Set(["host", "connection", "keep-alive"]);
const HOP_BY_HOP_RESPONSE = new Set([
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

async function forward(request: NextRequest, segments: string[]) {
  const url = new URL(`/${segments.join("/")}`, BACKEND_URL);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  // Defense-in-depth: tag requests coming from the trusted Next proxy. The
  // backend can choose to enforce this header on protected routes later.
  headers.set("x-internal-api-token", INTERNAL_TOKEN);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // Stream the body through instead of reading it as text — `await
  // request.text()` corrupts binary payloads (multipart avatar uploads,
  // future file attachments) by UTF-8-decoding raw bytes. The stream form
  // requires duplex:'half' on Node's fetch.
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    return new Response(JSON.stringify({ detail: "Upstream unreachable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_RESPONSE.has(lower) || lower === "set-cookie") return;
    respHeaders.set(key, value);
  });
  // Preserve each Set-Cookie as its own header (the default Headers iterator
  // joins them with commas, which corrupts cookies that contain commas in
  // their `Expires=` value).
  for (const cookie of upstream.headers.getSetCookie()) {
    respHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
