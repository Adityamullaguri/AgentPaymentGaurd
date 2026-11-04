import {
  gatewayConfiguration,
  proxyGatewayResponse,
  readRequestBody,
  sendProxyError,
  type VercelRequest,
  type VercelResponse,
} from "../../../_proxy.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { gatewayUrl, adminKey } = gatewayConfiguration();
    const id = request.query.id;
    const action = request.query.action;
    if (
      typeof id !== "string" ||
      typeof action !== "string" ||
      !["approve", "reject", "decision"].includes(action)
    ) {
      response.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested approval endpoint does not exist",
        },
      });
      return;
    }

    const body = await readRequestBody(request);
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
