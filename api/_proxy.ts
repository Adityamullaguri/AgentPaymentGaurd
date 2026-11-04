import type { IncomingMessage, ServerResponse } from "node:http";

export type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[] | undefined>;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

export function getGatewayConfig(): { url: string; key: string } {
  const url = process.env.GATEWAY_URL?.replace(/\/+$/, "");
  const key = process.env.ADMIN_KEY?.trim();
  if (!url || !key) {
    throw new Error("GATEWAY_URL and ADMIN_KEY must be configured");
  }
  return { url, key };
}

export function sendError(response: VercelResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : "Gateway proxy failed";
  response.status(502).json({
    error: { code: "GATEWAY_PROXY_ERROR", message },
  });
}

export async function readBody(
  request: IncomingMessage,
): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function forward(
  response: VercelResponse,
  upstream: Response,
): Promise<void> {
  response.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) response.setHeader("content-type", contentType);
  const body = await upstream.arrayBuffer();
  response.end(Buffer.from(body));
}
