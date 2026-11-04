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
    const requestUrl = request.url ?? "";
    const path = request.query.path;
    const queryPath = Array.isArray(path) ? path : path ? [path] : [];
    const pathname = requestUrl.split("?")[0] ?? "";
    const pathIndex = pathname.indexOf("/api/admin/");
    const urlPath =
      pathIndex < 0
        ? []
        : pathname
            .slice(pathIndex + "/api/admin/".length)
            .split("/")
            .filter(Boolean)
            .map((segment) => decodeURIComponent(segment));
    const segments = urlPath.length > queryPath.length ? urlPath : queryPath;
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
