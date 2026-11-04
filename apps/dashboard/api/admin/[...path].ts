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
    let upstreamQuery = query;
    let body = await readRequestBody(request);
    let upstreamMethod = request.method ?? "GET";
    let upstreamPath = segments
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const requestQuery = new URLSearchParams(query);
    const queryAction = requestQuery.get("action");
    const queryApprovalId = requestQuery.get("approval_id");
    const queryAgentId = requestQuery.get("agent_id");
    if (
      request.method === "GET" &&
      upstreamPath === "approvals" &&
      queryApprovalId &&
      queryAction &&
      ["approve", "reject", "decision"].includes(queryAction)
    ) {
      upstreamMethod = "POST";
      upstreamPath = `approvals/${encodeURIComponent(queryApprovalId)}/${queryAction}`;
      const note = requestQuery.get("note");
      body = note ? JSON.stringify({ note }) : "{}";
      upstreamQuery = "";
    }
    if (
      request.method === "GET" &&
      upstreamPath === "agents" &&
      queryAgentId &&
      queryAction &&
      ["freeze", "unfreeze"].includes(queryAction)
    ) {
      upstreamMethod = "POST";
      upstreamPath = `agents/${encodeURIComponent(queryAgentId)}/${queryAction}`;
      const reason = requestQuery.get("reason");
      body = reason ? JSON.stringify({ reason }) : "{}";
      upstreamQuery = "";
    }
    if (request.method === "POST" && upstreamPath === "approvals" && body) {
      try {
        const payload: unknown = JSON.parse(body);
        if (
          typeof payload === "object" &&
          payload !== null &&
          "approval_id" in payload &&
          typeof payload.approval_id === "string" &&
          "action" in payload &&
          typeof payload.action === "string" &&
          ["approve", "reject", "decision"].includes(payload.action)
        ) {
          upstreamPath = `approvals/${encodeURIComponent(payload.approval_id)}/${payload.action}`;
          const forwardedBody = { ...payload };
          delete forwardedBody.approval_id;
          delete forwardedBody.action;
          body = JSON.stringify(forwardedBody);
        }
      } catch {
        // Let the gateway return its standard invalid-request response.
      }
    }
    if (request.method === "POST" && upstreamPath === "agents" && body) {
      try {
        const payload: unknown = JSON.parse(body);
        if (
          typeof payload === "object" &&
          payload !== null &&
          "agent_id" in payload &&
          typeof payload.agent_id === "string" &&
          "action" in payload &&
          typeof payload.action === "string" &&
          ["freeze", "unfreeze"].includes(payload.action)
        ) {
          upstreamPath = `agents/${encodeURIComponent(payload.agent_id)}/${payload.action}`;
          const forwardedBody = { ...payload };
          delete forwardedBody.agent_id;
          delete forwardedBody.action;
          body = JSON.stringify(forwardedBody);
        }
      } catch {
        // Let the gateway return its standard invalid-request response.
      }
    }
    const upstreamUrl = `${gatewayUrl}/v1/admin/${upstreamPath}${upstreamQuery}`;
    const upstream = await fetch(upstreamUrl, {
      method: upstreamMethod,
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
