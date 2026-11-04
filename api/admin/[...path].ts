import {
  forward,
  getGatewayConfig,
  readBody,
  sendError,
  type VercelRequest,
  type VercelResponse,
} from "../_proxy";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { url, key } = getGatewayConfig();
    const requestUrl = request.url ?? "";
    const pathFromUrl = requestUrl.split("?")[0]
      .replace(/^\/api\/admin\/?/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const path = request.query.path;
    const segments = pathFromUrl.length > 0
      ? pathFromUrl
      : Array.isArray(path)
        ? path
        : path
          ? [path]
          : [];
    const queryIndex = requestUrl.indexOf("?");
    const query = queryIndex < 0 ? "" : requestUrl.slice(queryIndex);
    const body = await readBody(request);
    const upstream = await fetch(
      `${url}/v1/admin/${segments.map(encodeURIComponent).join("/")}${query}`,
      {
        method: request.method ?? "GET",
        headers: {
          "X-Admin-Key": key,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
      },
    );
    await forward(response, upstream);
  } catch (error) {
    sendError(response, error);
  }
}
