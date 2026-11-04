import type { IncomingMessage, ServerResponse } from "node:http";

export type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  send(body: unknown): void;
};

export function gatewayConfiguration(): {
  gatewayUrl: string;
  adminKey: string;
} {
  const gatewayUrl = process.env.GATEWAY_URL?.replace(/\/+$/, "");
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!gatewayUrl || !adminKey) {
    throw new Error("GATEWAY_URL and ADMIN_KEY must be configured on Vercel");
  }
  return { gatewayUrl, adminKey };
}

export async function readRequestBody(
  request: IncomingMessage,
): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function sendProxyError(response: VercelResponse, error: unknown): void {
  const message =
    error instanceof Error ? error.message : "The gateway proxy failed";
  console.error("Dashboard gateway proxy failed", {
    errorType: error instanceof Error ? error.name : "UnknownError",
    message,
  });
  response.status(502).json({
    error: {
      code: "GATEWAY_PROXY_ERROR",
      message,
    },
  });
}

export async function proxyGatewayResponse(
  response: VercelResponse,
  upstream: Response,
): Promise<void> {
  response.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    response.setHeader("content-type", contentType);
  }
  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl) {
    response.setHeader("cache-control", cacheControl);
  }

  const body = await upstream.arrayBuffer();
  response.end(Buffer.from(body));
}
