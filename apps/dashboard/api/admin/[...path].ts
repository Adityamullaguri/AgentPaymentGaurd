import {
  gatewayConfiguration,
  proxyGatewayResponse,
  readRequestBody,
  sendProxyError,
  type VercelRequest,
  type VercelResponse,
} from "../_proxy.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { gatewayUrl, adminKey } = gatewayConfiguration();
    const path = request.query.path;
    const segments = Array.isArray(path) ? path : path ? [path] : [];
    const requestUrl = request.url ?? "";
    const queryIndex = requestUrl.indexOf("?");
    const query = queryIndex < 0
      ? ""
      : requestUrl.slice(queryIndex);
    const upstreamUrl = `${gatewayUrl}/v1/admin/${segments
      .map((segment) => encodeURIComponent(segment))
      .join("/")}${query}`;
    const body = await readRequestBody(request);
    const upstream = await fetch(upstreamUrl, {
      method: request.method ?? "GET",
      headers: {
        "X-Admin-Key": adminKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
    });
    await proxyGatewayResponse(response, upstream);
  } catch (error) {
    sendProxyError(response, error);
  }
}
