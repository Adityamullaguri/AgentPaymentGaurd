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
    const requestPath = requestUrl.startsWith("http://") || requestUrl.startsWith("https://")
      ? new URL(requestUrl).pathname
      : requestUrl.split("?")[0];
    const pathFromUrl = requestPath
      .replace(/^\/api\/admin\/?/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const path = request.query.path;
    const queryPath = Array.isArray(path) ? path : path ? [path] : [];
    const segments = pathFromUrl.length > 0
      ? pathFromUrl
      : queryPath.flatMap((segment) => segment.split("/").filter(Boolean).map(decodeURIComponent));
    const queryIndex = requestUrl.indexOf("?");
    const query = queryIndex < 0 ? "" : requestUrl.slice(queryIndex);
    let body = await readBody(request);
    let upstreamMethod = request.method ?? "GET";
    let upstreamSegments = segments;
    let upstreamQuery = query;
    const requestQuery = new URLSearchParams(query);
    const queryAction = requestQuery.get("action");
    const queryScenario = requestQuery.get("scenario");
    const queryApprovalId = requestQuery.get("approval_id");
    const queryAgentId = requestQuery.get("agent_id");
    if (
      request.method === "GET" &&
      segments.join("/") === "approvals" &&
      queryApprovalId &&
      queryAction &&
      ["approve", "reject", "decision"].includes(queryAction)
    ) {
      upstreamMethod = "POST";
      upstreamSegments = ["approvals", queryApprovalId, queryAction];
      const note = requestQuery.get("note");
      body = note ? JSON.stringify({ note }) : "{}";
      upstreamQuery = "";
    } else if (
      request.method === "GET" &&
      segments.join("/") === "agents" &&
      queryAgentId &&
      queryAction &&
      ["freeze", "unfreeze"].includes(queryAction)
    ) {
      upstreamMethod = "POST";
      upstreamSegments = ["agents", queryAgentId, queryAction];
      const reason = requestQuery.get("reason");
      body = reason ? JSON.stringify({ reason }) : "{}";
      upstreamQuery = "";
    } else if (
      request.method === "GET" &&
      segments.join("/") === "demo" &&
      queryScenario
    ) {
      upstreamMethod = "POST";
      upstreamSegments = ["demo", queryScenario];
      upstreamQuery = "";
    } else if (request.method === "GET" && segments.join("/") === "demo/stop") {
      upstreamMethod = "POST";
      upstreamQuery = "";
    }
    const upstream = await fetch(
      `${url}/v1/admin/${upstreamSegments.map(encodeURIComponent).join("/")}${upstreamQuery}`,
      {
        method: upstreamMethod,
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
