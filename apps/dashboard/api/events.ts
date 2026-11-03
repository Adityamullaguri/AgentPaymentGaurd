import {
  gatewayConfiguration,
  sendProxyError,
  type VercelRequest,
  type VercelResponse,
} from "./_proxy.js";

export const config = {
  maxDuration: 300,
};

export default async function handler(
  _request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { gatewayUrl, adminKey } = gatewayConfiguration();
    const upstream = await fetch(`${gatewayUrl}/v1/events`, {
      headers: {
        Accept: "text/event-stream",
        "X-Admin-Key": adminKey,
      },
    });

    response.status(upstream.status);
    response.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "text/event-stream",
    );
    response.setHeader(
      "cache-control",
      upstream.headers.get("cache-control") ?? "no-cache, no-transform",
    );
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();

    if (!upstream.body) {
      response.end();
      return;
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        response.write(Buffer.from(chunk.value));
      }
    } finally {
      reader.releaseLock();
      response.end();
    }
  } catch (error) {
    if (!response.headersSent) {
      sendProxyError(response, error);
      return;
    }
    response.end();
  }
}
