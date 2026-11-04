export interface Agent {
  id: string;
  name: string;
  daily_cap: number;
  spent_today: number;
  pending_today: number;
  remaining: number;
  frozen: boolean;
  frozen_reason: string | null;
}

export interface Approval {
  approval_id: string;
  transaction_id: string;
  agent_id: string;
  amount: number;
  status: string;
  note: string | null;
  requested_at: string;
  resolved_at: string | null;
  payment_intent_id: string;
  seller_id: string;
  resource_id: string;
  purpose: string | null;
}

export interface Transaction {
  id: string;
  agent_id: string;
  payment_intent_id: string;
  seller_id: string;
  resource_id: string;
  amount: number;
  currency: string;
  status: string;
  decision: string;
  reason: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  event: string;
  agent_id: string | null;
  reason: string | null;
  amount: number | null;
  ref_id: string | null;
  detail: string | null;
  payment_intent_id?: string | null;
}

export interface DashboardSnapshot {
  mode: "guarded" | "passthrough";
  agents: Agent[];
  approvals: Approval[];
  transactions: Transaction[];
  audit: AuditEntry[];
}

export type GatewayEventName =
  | "transaction"
  | "approval_requested"
  | "approval_resolved"
  | "agent_frozen"
  | "agent_unfrozen"
  | "mode_changed"
  | "demo_status";

export type GatewayEvent = {
  [Name in GatewayEventName]: {
    name: Name;
    data: Record<string, unknown>;
  };
}[GatewayEventName];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Cannot reach the gateway. Check that it is running, then retry.");
  }
  const responseText = await response.text();
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error
        ? String(body.error.message)
        : response.status >= 500
          ? `Gateway returned HTTP ${response.status}. Check that it is running and inspect its logs.`
          : `Dashboard request failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  if (body === undefined) {
    throw new Error("The gateway returned an empty response.");
  }
  return body as T;
}

export async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const [agentsResult, approvalsResult, transactionsResult, auditResult, modeResult] =
    await Promise.all([
      request<{ agents: Agent[] }>("/api/admin/agents"),
      request<{ approvals: Approval[] }>("/api/admin/approvals?status=pending"),
      request<{ transactions: Transaction[] }>("/api/admin/transactions?limit=500"),
      request<{ audit: AuditEntry[] }>("/api/admin/audit?limit=100"),
      request<{ mode: DashboardSnapshot["mode"] }>("/api/admin/mode"),
    ]);
  return {
    mode: modeResult.mode,
    agents: agentsResult.agents,
    approvals: approvalsResult.approvals,
    transactions: transactionsResult.transactions,
    audit: auditResult.audit,
  };
}

export async function adminAction(
  path: string,
  method = "POST",
  body?: unknown,
): Promise<void> {
  await request(`/api/admin${path.replace(/^\/admin-api/, "")}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function connectEvents(
  onEvent: (event: GatewayEvent) => void,
  onStatus: (connected: boolean) => void,
): EventSource {
  const source = new EventSource("/api/events");
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  const names: GatewayEventName[] = [
    "transaction",
    "approval_requested",
    "approval_resolved",
    "agent_frozen",
    "agent_unfrozen",
    "mode_changed",
    "demo_status",
  ];
  for (const name of names) {
    source.addEventListener(name, (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data === "object" && data !== null) {
          onEvent({ name, data: data as Record<string, unknown> });
        }
      } catch {
        onStatus(false);
      }
    });
  }
  return source;
}
