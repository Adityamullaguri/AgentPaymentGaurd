import type {
  DashboardSnapshot,
  GatewayEvent,
} from "./api.js";

export interface DashboardState extends DashboardSnapshot {
  connected: boolean;
  error: string | null;
  lastDemoMessage: string | null;
}

export type DashboardAction =
  | { type: "loaded"; snapshot: DashboardSnapshot }
  | { type: "connection"; connected: boolean }
  | { type: "error"; message: string | null }
  | { type: "sse:transaction"; data: GatewayEvent["data"] }
  | { type: "sse:approval_requested"; data: GatewayEvent["data"] }
  | { type: "sse:approval_resolved"; data: GatewayEvent["data"] }
  | { type: "sse:agent_frozen"; data: GatewayEvent["data"] }
  | { type: "sse:agent_unfrozen"; data: GatewayEvent["data"] }
  | { type: "sse:mode_changed"; data: GatewayEvent["data"] }
  | { type: "sse:demo_status"; data: GatewayEvent["data"] };

export const initialState: DashboardState = {
  mode: "guarded",
  agents: [],
  approvals: [],
  transactions: [],
  audit: [],
  connected: false,
  error: null,
  lastDemoMessage: null,
};

export function dashboardReducer(
  state: DashboardState,
  action: DashboardAction,
): DashboardState {
  switch (action.type) {
    case "loaded":
      return { ...state, ...action.snapshot, error: null };
    case "connection":
      return { ...state, connected: action.connected };
    case "error":
      return { ...state, error: action.message };
    case "sse:transaction":
    case "sse:approval_requested":
    case "sse:approval_resolved":
    case "sse:agent_frozen":
    case "sse:agent_unfrozen":
      return state;
    case "sse:mode_changed":
      return {
        ...state,
        mode:
          action.data.mode === "passthrough"
            ? "passthrough"
            : "guarded",
      };
    case "sse:demo_status":
      return {
        ...state,
        lastDemoMessage:
          typeof action.data.message === "string"
            ? action.data.message
            : `Demo ${String(action.data.scenario ?? "")}: ${String(action.data.status ?? "")}`,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
