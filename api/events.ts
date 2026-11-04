import {
  getGatewayConfig,
  sendError,
  type VercelRequest,
  type VercelResponse,
} from "./_proxy";

export const config = { maxDuration: 300 };

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { url, key } = getGatewayConfig();
    const upstream = await fetch(`${url}/v1/events`, {
      headers: { Accept: "text/event-stream", "X-Admin-Key": key },
    });
    response.status(upstream.status);
    response.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "text/event-stream",
    );
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    if (!upstream.body) {
      response.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        response.write(Buffer.from(chunk.value));
      }
    } finally {
      reader.releaseLock();
      response.end();
    }
  } catch (error) {
    if (!response.headersSent) sendError(response, error);
    else response.end();
  }
}
