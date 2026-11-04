import {
  gatewayConfiguration,
  proxyGatewayResponse,
  readRequestBody,
  sendProxyError,
  type VercelRequest,
  type VercelResponse,
} from "../../_proxy.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { gatewayUrl, adminKey } = gatewayConfiguration();
    const body = await readRequestBody(request);
    let payload: unknown;
    try {
      payload = body ? JSON.parse(body) : undefined;
    } catch {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Approval request body must be valid JSON",
        },
      });
      return;
    }
    const id =
      typeof payload === "object" &&
      payload !== null &&
      "approval_id" in payload &&
      typeof payload.approval_id === "string"
        ? payload.approval_id
        : undefined;
    const action =
      typeof payload === "object" &&
      payload !== null &&
      "action" in payload &&
      typeof payload.action === "string"
        ? payload.action
        : undefined;
    if (
      typeof id !== "string" ||
      typeof action !== "string" ||
      !["approve", "reject", "decision"].includes(action)
    ) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Approval id and action are required",
        },
      });
      return;
    }

    const upstream = await fetch(
      `${gatewayUrl}/v1/admin/approvals/${encodeURIComponent(id)}/${action}`,
      {
        method: request.method ?? "GET",
        headers: {
          "X-Admin-Key": adminKey,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
      },
    );
    await proxyGatewayResponse(response, upstream);
  } catch (error) {
    sendProxyError(response, error);
  }
}
