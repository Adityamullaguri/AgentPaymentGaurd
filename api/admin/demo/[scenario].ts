import {
  forward,
  getGatewayConfig,
  readBody,
  sendError,
  type VercelRequest,
  type VercelResponse,
} from "../../_proxy";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  try {
    const { url, key } = getGatewayConfig();
    const scenario = request.query.scenario;
    const name = Array.isArray(scenario) ? scenario[0] : scenario;
    if (!name) {
      response.status(400).json({ error: { code: "BAD_SCENARIO", message: "Scenario is required" } });
      return;
    }
    const body = await readBody(request);
    const upstream = await fetch(
      `${url}/v1/admin/demo/${encodeURIComponent(name)}`,
      {
        method: request.method ?? "POST",
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
