import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  adminAction,
  connectEvents,
  fetchSnapshot,
  type Approval,
  type AuditEntry,
  type Transaction,
} from "./api.js";
import { dashboardReducer, initialState } from "./store.js";

const DEMO_OPTIONS = [
  { value: "happy_path", label: "Happy path" },
  { value: "large_purchase", label: "Large purchase (approval)" },
  { value: "runaway", label: "Runaway agent" },
  { value: "runaway_unguarded", label: "Runaway, unguarded baseline" },
];

const HISTORY_PERIODS = [
  { value: "24h", label: "24H", durationMs: 24 * 60 * 60 * 1000, buckets: 24 },
  { value: "7d", label: "7D", durationMs: 7 * 24 * 60 * 60 * 1000, buckets: 7 },
  { value: "30d", label: "30D", durationMs: 30 * 24 * 60 * 60 * 1000, buckets: 30 },
  { value: "90d", label: "90D", durationMs: 90 * 24 * 60 * 60 * 1000, buckets: 13 },
] as const;

type HistoryPeriod = (typeof HISTORY_PERIODS)[number]["value"];

interface DropdownOption {
  value: string;
  label: string;
}

function Dropdown({
  label,
  value,
  options,
  onChange,
  className = "",
  disabled = false,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const activeOption = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    activeOption?.focus();
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function showMenu(index = Math.max(0, options.findIndex((option) => option.value === value))) {
    setActiveIndex(index);
    setOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      showMenu();
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + direction + options.length) % options.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`custom-dropdown ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : showMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? "Select an option"}</span>
        <svg className="dropdown-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="dropdown-menu" id={`${id}-options`} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={disabled}
              className={`dropdown-option ${index === activeIndex ? "is-active" : ""}`}
              data-option-index={index}
              key={option.value}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={handleOptionKeyDown}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 8 3 3 7-7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function approvalWaitingSeconds(approval: Approval, now: number): number {
  const requested = new Date(approval.requested_at).getTime();
  return Math.max(0, Math.floor((now - requested) / 1000));
}

function amount(value: number | null): string {
  return value === null ? "—" : `${value}¢`;
}

function StatusChip({ value }: { value: string }): JSX.Element {
  const status = value.toLowerCase();
  return <span className={`status-chip status-${status}`}>{value.replaceAll("_", " ")}</span>;
}

function approvalSecondsLeft(approval: Approval, now: number): number {
  const requested = new Date(approval.requested_at).getTime();
  return Math.max(0, Math.ceil((requested + 120_000 - now) / 1000));
}

function Sparkline({ values }: { values: number[] }): JSX.Element | null {
  if (values.length === 0) return null;
  const trend = values;
  const max = Math.max(1, ...trend);
  const points = trend.map((value, index) => {
    const x = trend.length < 2 ? 50 : (index / (trend.length - 1)) * 100;
    const y = 28 - (value / max) * 24;
    return `${x},${y}`;
  });
  return (
    <svg className="sparkline" viewBox="0 0 100 32" role="img" aria-label="Recent trend">
      <polyline points={points.join(" ")} />
    </svg>
  );
}

function TransactionHistoryChart({
  transactions,
  period,
  now,
  unavailable,
  onPeriodChange,
}: {
  transactions: Transaction[];
  period: HistoryPeriod;
  now: number;
  unavailable: boolean;
  onPeriodChange: (period: HistoryPeriod) => void;
}): JSX.Element {
  const [hoveredPoint, setHoveredPoint] = useState<{
    index: number;
    label: string;
    count: number;
    status: "succeeded" | "blocked" | "pending";
  } | null>(null);
  const selectedPeriod = HISTORY_PERIODS.find((item) => item.value === period)!;
  const start = now - selectedPeriod.durationMs;
  const bucketDuration = selectedPeriod.durationMs / selectedPeriod.buckets;
  const points = Array.from({ length: selectedPeriod.buckets }, (_, index) => {
    const bucketStart = start + index * bucketDuration;
    const bucketDate = new Date(bucketStart);
    return {
      label:
        period === "24h"
          ? bucketDate.toLocaleTimeString(undefined, { hour: "numeric" })
          : bucketDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      succeeded: 0,
      blocked: 0,
      pending: 0,
    };
  });

  for (const transaction of transactions) {
    const timestamp = new Date(transaction.created_at).getTime();
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > now) continue;
    const index = Math.min(
      points.length - 1,
      Math.floor((timestamp - start) / bucketDuration),
    );
    const status = transaction.status.toLowerCase();
    if (status === "succeeded") points[index].succeeded += 1;
    if (["denied", "rejected", "failed"].includes(status)) {
      points[index].blocked += 1;
    }
    if (["processing", "pending_approval"].includes(status)) {
      points[index].pending += 1;
    }
  }

  const succeeded = transactions.filter(
    (transaction) => transaction.status.toLowerCase() === "succeeded",
  ).length;
  const blocked = transactions.filter((transaction) =>
    ["denied", "rejected", "failed"].includes(transaction.status.toLowerCase()),
  ).length;
  const pending = transactions.filter((transaction) =>
    ["processing", "pending_approval"].includes(transaction.status.toLowerCase()),
  ).length;
  const plot = { left: 62, right: 790, top: 18, bottom: 190 };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const largestValue = Math.max(
    0,
    ...points.flatMap((point) => [point.succeeded, point.blocked, point.pending]),
  );
  const tickStep = Math.max(1, Math.ceil(largestValue / 4));
  const scaleMax = tickStep * 4;
  const xFor = (index: number) =>
    points.length < 2
      ? plot.left + plotWidth / 2
      : plot.left + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) => plot.bottom - (value / scaleMax) * plotHeight;
  const linePoints = (select: (point: (typeof points)[number]) => number) =>
    points.map((point, index) => `${xFor(index)},${yFor(select(point))}`).join(" ");
  const timeIndexes = [...new Set(
    [0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2),
      Math.floor((3 * (points.length - 1)) / 4), points.length - 1],
  )];

  return (
    <section className="panel transaction-history-chart" aria-labelledby="transaction-chart-title">
      <div className="transaction-chart-heading">
        <div>
          <h2 id="transaction-chart-title">Transaction activity</h2>
          <span className="chart-description">
            {selectedPeriod.label} window · up to 500 recent transactions
          </span>
        </div>
        <div className="history-periods" role="group" aria-label="Transaction history period">
          {HISTORY_PERIODS.map((item) => (
            <button
              type="button"
              key={item.value}
              className={period === item.value ? "is-selected" : ""}
              aria-pressed={period === item.value}
              disabled={unavailable}
              onClick={() => onPeriodChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!unavailable && (
        <div className="history-chart-summary" aria-live="polite">
          <div>
            <span className="chart-key spent-key" />
            <span>Succeeded</span>
            <strong>{succeeded}</strong>
          </div>
          <div>
            <span className="chart-key blocked-key" />
            <span>Blocked</span>
            <strong>{blocked}</strong>
          </div>
          <div>
            <span className="chart-key pending-key" />
            <span>Pending</span>
            <strong>{pending}</strong>
          </div>
          <span className="history-total">{transactions.length} transactions</span>
        </div>
      )}
      {transactions.length === 0 ? (
        <p className={`chart-empty ${unavailable ? "is-unavailable" : ""}`} role="status">
          {unavailable
            ? "Waiting for gateway data. Start the gateway to view transaction activity."
            : period === "90d"
              ? "No transactions in the last 90 days."
              : "No transactions in this period. Try a wider range."}
        </p>
      ) : (
        <div className="chart-wrap history-chart-wrap">
          {hoveredPoint && (
            <div
              className={`chart-tooltip chart-tooltip-${hoveredPoint.status} ${hoveredPoint.index === points.length - 1 ? "is-edge" : ""}`}
              style={{
                left: `${(xFor(hoveredPoint.index) / 800) * 100}%`,
                top: `${(yFor(hoveredPoint.count) / 238) * 100}%`,
              }}
              role="status"
            >
              {hoveredPoint.label}: {hoveredPoint.count} {hoveredPoint.status}
            </div>
          )}
          <svg
            className="spend-chart"
            viewBox="0 0 800 238"
            role="img"
            aria-label={`Transaction counts over the last ${selectedPeriod.label}: ${succeeded} succeeded, ${blocked} blocked, and ${pending} pending`}
            preserveAspectRatio="none"
          >
            {[0, 1, 2, 3, 4].map((tick) => {
              const value = scaleMax - tick * tickStep;
              const y = yFor(value);
              return (
                <g key={value}>
                  <line
                    className={`chart-gridline ${tick === 4 ? "chart-zero-line" : ""}`}
                    x1={plot.left}
                    x2={plot.right}
                    y1={y}
                    y2={y}
                  />
                  <text className="chart-axis-label" x={plot.left - 10} y={y + 4} textAnchor="end">
                    {value}
                  </text>
                </g>
              );
            })}
            <polyline className="chart-line chart-succeeded" points={linePoints((point) => point.succeeded)} />
            <polyline className="chart-line chart-blocked" points={linePoints((point) => point.blocked)} />
            <polyline className="chart-line chart-pending" points={linePoints((point) => point.pending)} />
            {points.map((point, index) => (
              point.succeeded > 0 ? (
                <circle
                  className="chart-point chart-point-spent"
                  key={`succeeded-${index}`}
                  cx={xFor(index)}
                  cy={yFor(point.succeeded)}
                  r="3.5"
                  tabIndex={0}
                  aria-label={`${point.succeeded} succeeded transactions at ${point.label}`}
                  onMouseEnter={() => setHoveredPoint({ index, label: point.label, count: point.succeeded, status: "succeeded" })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint({ index, label: point.label, count: point.succeeded, status: "succeeded" })}
                  onBlur={() => setHoveredPoint(null)}
                >
                </circle>
              ) : null
            ))}
            {points.map((point, index) => (
              point.blocked > 0 ? (
                <circle
                  className="chart-point chart-point-blocked"
                  key={`blocked-${index}`}
                  cx={xFor(index)}
                  cy={yFor(point.blocked)}
                  r="3.5"
                  tabIndex={0}
                  aria-label={`${point.blocked} blocked transactions at ${point.label}`}
                  onMouseEnter={() => setHoveredPoint({ index, label: point.label, count: point.blocked, status: "blocked" })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint({ index, label: point.label, count: point.blocked, status: "blocked" })}
                  onBlur={() => setHoveredPoint(null)}
                >
                </circle>
              ) : null
            ))}
            {points.map((point, index) => (
              point.pending > 0 ? (
                <circle
                  className="chart-point chart-point-pending"
                  key={`pending-${index}`}
                  cx={xFor(index)}
                  cy={yFor(point.pending)}
                  r="3.5"
                  tabIndex={0}
                  aria-label={`${point.pending} pending transactions at ${point.label}`}
                  onMouseEnter={() => setHoveredPoint({ index, label: point.label, count: point.pending, status: "pending" })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint({ index, label: point.label, count: point.pending, status: "pending" })}
                  onBlur={() => setHoveredPoint(null)}
                >
                </circle>
              ) : null
            ))}
            {timeIndexes.map((index) => (
              <text
                className="chart-axis-label chart-time-label"
                key={`${index}-${points[index]?.label ?? "empty"}`}
                x={xFor(index)}
                y="226"
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              >
                {points[index]?.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

type GateState = "passed" | "blocked" | "review" | "skipped";

const POLICY_GATES = [
  { reason: "DUPLICATE_PAYMENT_INTENT", label: "Payment intent", detail: "Reject replayed intents" },
  { reason: "AGENT_FROZEN", label: "Agent status", detail: "Confirm the agent can spend" },
  { reason: "CURRENCY_NOT_ALLOWED", label: "Currency allowlist", detail: "Check the requested currency" },
  { reason: "SELLER_NOT_ALLOWED", label: "Seller allowlist", detail: "Check the seller is trusted" },
  { reason: "VELOCITY_LIMIT_EXCEEDED", label: "Velocity limit", detail: "Check recent purchase volume" },
  { reason: "PER_PURCHASE_CAP_EXCEEDED", label: "Purchase cap", detail: "Check the single-payment limit" },
  { reason: "DAILY_CAP_EXCEEDED", label: "Daily budget", detail: "Check spent plus pending amount" },
  { reason: "APPROVAL_REQUIRED", label: "Human approval", detail: "Route larger purchases for review" },
] as const;

function GateEvaluation({
  transaction,
  unavailable,
}: {
  transaction: Transaction | undefined;
  unavailable: boolean;
}): JSX.Element {
  const isApproval = transaction?.decision === "needs_approval";
  const isAllowed =
    transaction?.decision === "allow" ||
    ["succeeded", "paid"].includes(transaction?.status.toLowerCase() ?? "");
  const blockedGateIndex = transaction
    ? POLICY_GATES.findIndex((gate) => gate.reason === transaction.reason)
    : -1;

  function stateForGate(index: number): GateState {
    if (!transaction) return "skipped";
    if (isAllowed) return "passed";
    if (isApproval && index === POLICY_GATES.length - 1) return "review";
    if (blockedGateIndex === index) return "blocked";
    if (blockedGateIndex >= 0 && index > blockedGateIndex) return "skipped";
    return "passed";
  }

  const outcome = !transaction
    ? "Waiting for a payment"
    : isApproval
      ? "Needs human approval"
      : isAllowed
        ? "Payment approved"
        : "Payment denied";
  const outcomeClass = !transaction
    ? "neutral"
    : isApproval
      ? "review"
      : isAllowed
        ? "approved"
        : "denied";

  return (
    <section className="panel gate-evaluation-panel" aria-labelledby="gate-evaluation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Backend decision path</p>
          <h2 id="gate-evaluation-title">Gate evaluation</h2>
        </div>
        <span className={`gate-outcome gate-outcome-${outcomeClass}`}>
          <i aria-hidden="true" />
          {outcome}
        </span>
      </div>
      {transaction ? (
        <div className="gate-context">
          <div>
            <strong>{transaction.resource_id}</strong>
            <span>{transaction.agent_id} · {amount(transaction.amount)} · {transaction.payment_intent_id}</span>
          </div>
          <p>{transaction.reason}</p>
        </div>
      ) : (
        <p className="empty-state gate-empty">
          {unavailable
            ? "Reconnect the gateway to view policy evaluation."
            : "Run a demo to watch each payment gate evaluate in sequence."}
        </p>
      )}
      <ol className="gate-list" aria-label="Payment policy gates">
        {POLICY_GATES.map((gate, index) => {
          const gateState = stateForGate(index);
          return (
            <li className={`gate-step gate-step-${gateState}`} key={gate.reason}>
              <span className="gate-step-marker" aria-hidden="true">
                {gateState === "passed" ? "✓" : gateState === "blocked" ? "×" : gateState === "review" ? "!" : "·"}
              </span>
              <div>
                <strong>{gate.label}</strong>
                <span>{gate.detail}</span>
              </div>
              <em>{gateState === "passed" ? "Passed" : gateState === "blocked" ? "Denied" : gateState === "review" ? "Review" : "Skipped"}</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BudgetGauge({
  spent,
  pending,
  cap,
  tone,
}: {
  spent: number;
  pending: number;
  cap: number;
  tone: string;
}): JSX.Element {
  const spentPercent = Math.min(100, (spent / Math.max(1, cap)) * 100);
  const pendingPercent = Math.min(100 - spentPercent, (pending / Math.max(1, cap)) * 100);
  const remaining = Math.max(0, cap - spent - pending);
  return (
    <>
      <div
        className={`gauge-wrap tone-${tone}`}
        role="meter"
        aria-label="Daily spending budget"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={spent}
      >
        <svg className="budget-gauge" viewBox="0 0 200 116" aria-hidden="true">
          <defs>
            <pattern id="pending-stripe" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="#ffffff" />
              <rect width="3" height="7" fill="#7a7a7a" />
            </pattern>
          </defs>
          <path className="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" />
          {spentPercent > 0 && (
            <path
              className="gauge-spent"
              pathLength="100"
              d="M 20 100 A 80 80 0 0 1 180 100"
              strokeDasharray={`${spentPercent} ${100 - spentPercent}`}
            />
          )}
          {pendingPercent > 0 && (
            <path
              className="gauge-pending"
              pathLength="100"
              d="M 20 100 A 80 80 0 0 1 180 100"
              strokeDasharray={`${pendingPercent} ${100 - pendingPercent}`}
              strokeDashoffset={-spentPercent}
            />
          )}
        </svg>
        <div className="gauge-value">
          <strong>{spent}</strong>
          <span>of {cap} cents</span>
        </div>
      </div>
      <p className="budget-caption">{spent} / {cap} cents ({Math.round(spentPercent)}%)</p>
      <div className="budget-legend">
        <span><i className="legend-spent" />Spent {spent}¢</span>
        <span><i className="legend-pending" />Pending {pending}¢</span>
        <span><i className="legend-remaining" />{remaining}¢ remaining</span>
      </div>
    </>
  );
}

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [demoScenario, setDemoScenario] = useState("happy_path");
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoStopping, setDemoStopping] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [resolvingApprovals, setResolvingApprovals] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeSection, setActiveSection] = useState(
    () => window.location.hash.slice(1) || "overview",
  );
  const [filterEvent, setFilterEvent] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("30d");
  const [clock, setClock] = useState(Date.now());
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [highlightedApproval, setHighlightedApproval] = useState<string | null>(null);
  const knownApprovals = useRef(new Set<string>());
  const refreshVersion = useRef(0);
  const refreshTimer = useRef<number | undefined>(undefined);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    const requestVersion = ++refreshVersion.current;
    setRefreshing(true);
    try {
      const snapshot = await fetchSnapshot();
      if (requestVersion === refreshVersion.current) {
        dispatch({ type: "loaded", snapshot });
        setSnapshotLoaded(true);
      }
    } catch (error) {
      if (requestVersion === refreshVersion.current) {
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : "Could not load dashboard data",
        });
      }
    } finally {
      if (requestVersion === refreshVersion.current) {
        setRefreshing(false);
      }
      refreshInFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        window.setTimeout(() => void refresh(), 0);
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== undefined) {
      window.clearTimeout(refreshTimer.current);
    }
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined;
      void refresh();
    }, 180);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const source = connectEvents(
      (event) => {
        dispatch({ type: `sse:${event.name}`, data: event.data });
        if (event.name === "demo_status") {
          const status = event.data.status;
          setDemoBusy(status !== "completed" && status !== "cancelled");
          setDemoStopping(status === "stopping");
          if (status === "completed" || status === "cancelled") {
            scheduleRefresh();
          }
        } else {
          scheduleRefresh();
        }
      },
      (connected) => {
        dispatch({ type: "connection", connected });
        if (connected) {
          scheduleRefresh();
        }
      },
    );
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      source.close();
      window.clearInterval(timer);
      if (refreshTimer.current !== undefined) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = undefined;
      }
    };
  }, [refresh, scheduleRefresh]);

  useEffect(() => {
    const updateActiveSection = () =>
      setActiveSection(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", updateActiveSection);
    return () => window.removeEventListener("hashchange", updateActiveSection);
  }, []);

  useEffect(() => {
    let flashTimer: number | undefined;
    let titleTimer: number | undefined;
    const originalTitle = document.title;
    const newApproval = state.approvals.find(
      (approval) => !knownApprovals.current.has(approval.approval_id),
    );
    for (const approval of state.approvals) {
      knownApprovals.current.add(approval.approval_id);
    }
    if (newApproval) {
      setHighlightedApproval(newApproval.approval_id);
      let flash = false;
      flashTimer = window.setInterval(() => {
        document.title = flash ? "Approval waiting — AgentPaymentGaurd" : originalTitle;
        flash = !flash;
      }, 700);
      titleTimer = window.setTimeout(() => {
        if (flashTimer !== undefined) {
          window.clearInterval(flashTimer);
        }
        document.title = originalTitle;
      }, 5000);
    }
    return () => {
      if (flashTimer !== undefined) {
        window.clearInterval(flashTimer);
      }
      if (titleTimer !== undefined) {
        window.clearTimeout(titleTimer);
      }
      document.title = originalTitle;
    };
  }, [state.approvals]);

  useEffect(() => {
    const hasProcessingPayment = state.transactions.some(
      (transaction) => transaction.status.toLowerCase() === "processing",
    );
    if (!hasProcessingPayment) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [refresh, state.transactions]);

  useEffect(() => {
    if (!highlightedApproval) return;
    const timer = window.setTimeout(() => setHighlightedApproval(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightedApproval]);

  const agent = state.agents[0];
  const visibleAudit = useMemo(
    () =>
      state.audit.filter((row) => {
        const matchesEvent = !filterEvent || row.event === filterEvent;
        const matchesAgent = !filterAgent || row.agent_id === filterAgent;
        const search = auditSearch.trim().toLowerCase();
        const matchesSearch =
          !search ||
          row.ref_id?.toLowerCase().includes(search) ||
          row.payment_intent_id?.toLowerCase().includes(search) ||
          row.detail?.toLowerCase().includes(search);
        return matchesEvent && matchesAgent && matchesSearch;
      }),
    [auditSearch, filterAgent, filterEvent, state.audit],
  );
  const spentPercent = agent
    ? Math.min(100, (agent.spent_today / Math.max(1, agent.daily_cap)) * 100)
    : 0;
  const gaugeTone = spentPercent >= 90 ? "danger" : spentPercent >= 70 ? "warning" : "normal";
  const blockedTransactions = useMemo(
    () =>
      state.transactions.filter((transaction) =>
        ["denied", "rejected", "failed"].includes(transaction.status.toLowerCase()),
      ),
    [state.transactions],
  );
  const blockedAmount = useMemo(
    () => blockedTransactions.reduce((total, transaction) => total + transaction.amount, 0),
    [blockedTransactions],
  );
  const recentTransactions = useMemo(
    () =>
      [...state.transactions].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      ),
    [state.transactions],
  );
  const recentTrend = useMemo(
    () =>
      [...recentTransactions]
        .reverse()
        .slice(-8)
        .map((transaction) => transaction.amount),
    [recentTransactions],
  );
  const selectedHistoryPeriod = HISTORY_PERIODS.find(
    (period) => period.value === historyPeriod,
  )!;
  const isInitialLoading = !snapshotLoaded && refreshing && !state.error;
  const historyTransactions = recentTransactions.filter((transaction) => {
    const timestamp = new Date(transaction.created_at).getTime();
    return (
      Number.isFinite(timestamp) &&
      timestamp >= clock - selectedHistoryPeriod.durationMs &&
      timestamp <= clock
    );
  });
  const activityTransactions = historyTransactions.slice(0, 100);

  async function runDemo(): Promise<void> {
    setDemoBusy(true);
    setDemoStopping(false);
    dispatch({ type: "error", message: null });
    try {
      await adminAction(
        `/api/admin/demo?scenario=${encodeURIComponent(demoScenario)}`,
        "GET",
      );
    } catch (error) {
      setDemoBusy(false);
      setDemoStopping(false);
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "Could not start demo",
      });
    }
  }

  async function stopDemo(): Promise<void> {
    setDemoStopping(true);
    dispatch({ type: "error", message: null });
    try {
      await adminAction("/api/admin/demo?scenario=stop", "GET");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not stop the demo";
      const wasAlreadyStopped = message.includes("No demo scenario is currently running");
      setDemoBusy(false);
      setDemoStopping(false);
      dispatch({
        type: "error",
        message: wasAlreadyStopped ? null : message,
      });
      if (wasAlreadyStopped) {
        await refresh();
      }
    }
  }

  async function resetDemo(): Promise<void> {
    if (
      resetBusy ||
      !window.confirm("Reset local demo transactions, approvals, and freeze state?")
    ) {
      return;
    }
    setResetBusy(true);
    try {
      await adminAction("/api/admin/reset");
      await refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not reset demo";
      dispatch({
        type: "error",
        message: message.includes("payments are processing")
          ? "A payment is still processing. The dashboard will keep checking its status before reset is enabled."
          : message,
      });
    } finally {
      setResetBusy(false);
    }
  }

  async function decideApproval(
    approvalId: string,
    decision: "approve" | "reject",
  ): Promise<void> {
    if (resolvingApprovals.has(approvalId)) return;
    setResolvingApprovals((current) => new Set(current).add(approvalId));
    try {
      const note = approvalNotes[approvalId]?.trim();
      await adminAction(
        `/api/admin/approvals?approval_id=${encodeURIComponent(approvalId)}&action=${decision}${note ? `&note=${encodeURIComponent(note)}` : ""}`,
        "GET",
      );
      await refresh();
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "Could not resolve approval",
      });
    } finally {
      setResolvingApprovals((current) => {
        const next = new Set(current);
        next.delete(approvalId);
        return next;
      });
    }
  }

  async function toggleFreeze(): Promise<void> {
    if (!agent || freezeBusy) return;
    setFreezeBusy(true);
    try {
      const action = agent.frozen ? "unfreeze" : "freeze";
      await adminAction(
        `/api/admin/agents?agent_id=${encodeURIComponent(agent.id)}&action=${action}&reason=${encodeURIComponent("Frozen by dashboard operator")}`,
        "GET",
      );
      await refresh();
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "Could not change agent state",
      });
    } finally {
      setFreezeBusy(false);
    }
  }

  return (
    <div className="app-shell">
      {state.mode === "passthrough" && (
        <div className="mode-banner" role="alert">
          PASSTHROUGH: NO LIMITS (BASELINE RUN)
        </div>
      )}
      <aside className="sidebar" aria-label="Dashboard navigation">
        <a className="rail-logo" href="#overview" aria-label="AgentPaymentGaurd home">
          <img src="/favicon.ico" alt="" />
        </a>
        <nav className="rail-nav">
          <a className={`rail-link ${activeSection === "overview" ? "active" : ""}`} href="#overview" aria-label="Overview" title="Overview" aria-current={activeSection === "overview" ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
            <span>Overview</span>
          </a>
          <a className={`rail-link ${activeSection === "approvals" ? "active" : ""}`} href="#approvals" aria-label="Approvals" title="Approvals" aria-current={activeSection === "approvals" ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z" /><path d="m8 12 2.5 2.5L16 9" /></svg>
            <span>Approvals</span>
          </a>
          <a className={`rail-link ${activeSection === "transactions" ? "active" : ""}`} href="#transactions" aria-label="Transactions" title="Transactions" aria-current={activeSection === "transactions" ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="7" cy="6" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="7" cy="18" r="1" /></svg>
            <span>Transactions</span>
          </a>
          <a className={`rail-link ${activeSection === "audit" ? "active" : ""}`} href="#audit" aria-label="Audit log" title="Audit log" aria-current={activeSection === "audit" ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>
            <span>Audit</span>
          </a>
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="brand">
            <h1>AgentPaymentGaurd</h1>
            <span className="subtitle">Autonomous spending control</span>
          </div>
          <div className="toolbar">
            {!state.connected && <span className="connection offline">Reconnecting…</span>}
            <span className={`mode-badge mode-${state.mode}`}>
              <i aria-hidden="true" />
              {state.mode}
            </span>
            <Dropdown
              className="scenario-dropdown"
              label="Demo scenario"
              value={demoScenario}
              options={DEMO_OPTIONS}
              onChange={setDemoScenario}
              disabled={demoBusy}
            />
            {demoBusy ? (
              <button
                className="button danger"
                onClick={() => void stopDemo()}
                disabled={demoStopping}
                aria-busy={demoStopping}
              >
                {demoStopping ? <><span className="micro-spinner" aria-hidden="true" />Stopping…</> : "Stop demo"}
              </button>
            ) : (
              <button className="button primary" onClick={() => void runDemo()}>
                Run demo
              </button>
            )}
            <button className="button secondary" onClick={() => void resetDemo()} disabled={demoBusy || resetBusy} aria-busy={resetBusy}>
              {resetBusy ? <><span className="micro-spinner" aria-hidden="true" />Resetting…</> : "Reset"}
            </button>
          </div>
        </header>

        <main
          className="dashboard-content"
          id="overview"
          aria-busy={isInitialLoading || refreshing}
        >
          {state.error && (
            <div className="error-banner" role="alert">
              <span>{state.error}</span>
              <button
                type="button"
                className="button secondary"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-busy={refreshing}
              >
                {refreshing
                  ? <><span className="micro-spinner" aria-hidden="true" />Retrying…</>
                  : "Retry"}
              </button>
            </div>
          )}
          {isInitialLoading && (
            <div className="loading-banner" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              <span>Loading dashboard data…</span>
            </div>
          )}
          {snapshotLoaded && !state.connected && (
            <div className="connection-banner" role="status" aria-live="polite">
              <span>
                Live updates are paused. Showing the latest available data while the gateway reconnects.
              </span>
              <button
                type="button"
                className="button secondary"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-busy={refreshing}
              >
                {refreshing
                  ? <><span className="micro-spinner" aria-hidden="true" />Refreshing…</>
                  : "Refresh"}
              </button>
            </div>
          )}
          {state.lastDemoMessage && (
            <div className="demo-message" aria-live="polite">{state.lastDemoMessage}</div>
          )}

          <div className={`overview-grid ${agent ? "has-agent" : "is-unavailable"}`}>
            <section className={`panel budget-panel ${agent ? "" : "is-unavailable"}`} aria-labelledby="budget-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Spending controls</p>
                  <h2 id="budget-title">
                    {agent ? `Daily budget · ${agent.id}` : snapshotLoaded ? "Agent budget" : "Daily budget"}
                  </h2>
                </div>
                {agent?.frozen && <span className="frozen-pill">FROZEN</span>}
              </div>
              {agent ? (
                <>
                  <BudgetGauge
                    spent={agent.spent_today}
                    pending={agent.pending_today}
                    cap={agent.daily_cap}
                    tone={gaugeTone}
                  />
                  <div className="freeze-row">
                    <div>
                      <strong>{agent.frozen ? "Agent is frozen" : "Agent is active"}</strong>
                      <p>{agent.frozen_reason ?? "Spending requests are being evaluated against policy."}</p>
                    </div>
                    <button
                      type="button"
                      className={`button ${agent.frozen ? "secondary" : "primary"}`}
                      onClick={() => void toggleFreeze()}
                      disabled={freezeBusy}
                      aria-busy={freezeBusy}
                    >
                      {freezeBusy
                        ? <><span className="micro-spinner" aria-hidden="true" />Updating…</>
                        : agent.frozen ? "Unfreeze agent" : "Freeze agent"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  {snapshotLoaded ? "No agent is configured." : state.error ? "Budget unavailable while the gateway is disconnected." : "Loading agent budget…"}
                </p>
              )}
            </section>

            <div className="insights-column">
              <section className="kpi-row" aria-label="Spending summary">
                <article className="panel kpi-card">
                  <span className="kpi-label">Spent today</span>
                  <strong className="kpi-value">{agent ? `${agent.spent_today}¢` : "—"}</strong>
                  <span className="kpi-detail">{agent ? `of ${agent.daily_cap}¢ daily cap` : snapshotLoaded ? "No agent configured" : "Budget unavailable"}</span>
                  <Sparkline values={recentTrend} />
                </article>
                <article className="panel kpi-card">
                  <span className="kpi-label">Blocked</span>
                  <strong className="kpi-value">{snapshotLoaded ? blockedTransactions.length : "—"}</strong>
                  <span className="kpi-detail">{snapshotLoaded ? `${blockedAmount}¢ stopped` : "Activity unavailable"}</span>
                  <Sparkline values={blockedTransactions.slice(-8).map((transaction) => transaction.amount)} />
                </article>
                <article className="panel kpi-card">
                  <span className="kpi-label">Waiting for you</span>
                  <strong className="kpi-value">{snapshotLoaded ? state.approvals.length : "—"}</strong>
                  <span className="kpi-detail">{snapshotLoaded ? "pending approvals" : "Approvals unavailable"}</span>
                  <Sparkline values={state.approvals.slice(-8).map((approval) => approval.amount)} />
                </article>
              </section>
            </div>

            <TransactionHistoryChart
              transactions={historyTransactions}
              period={historyPeriod}
              now={clock}
              unavailable={!snapshotLoaded}
              onPeriodChange={setHistoryPeriod}
            />
          </div>

          <GateEvaluation
            transaction={recentTransactions[0]}
            unavailable={!snapshotLoaded}
          />

          <div className="activity-grid">
            <section className="panel approvals-panel" id="approvals" aria-labelledby="approvals-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Operator action</p>
                  <h2 id="approvals-title">Pending approvals <span className="count-badge">{snapshotLoaded ? state.approvals.length : "—"}</span></h2>
                </div>
              </div>
              {state.approvals.length === 0 ? (
                <p className="empty-state">
                  {snapshotLoaded ? "No purchases waiting for you." : "Approvals are unavailable until the gateway reconnects."}
                </p>
              ) : (
                <div className="approval-list">
                  {state.approvals.map((approval) => (
                    <article
                      className={`approval-card ${highlightedApproval === approval.approval_id ? "approval-highlight" : ""}`}
                      key={approval.approval_id}
                    >
                      <div className="approval-info">
                        <strong>{approval.resource_id} <span>{amount(approval.amount)}</span></strong>
                        <span>{approval.agent_id} · {approval.seller_id}</span>
                        <span>{approval.purpose || "No purpose provided"}</span>
                        <span>Waiting {approvalWaitingSeconds(approval, clock)}s</span>
                        <label className="approval-note">
                          <span className="sr-only">Optional note</span>
                          <input
                            value={approvalNotes[approval.approval_id] ?? ""}
                            onChange={(event) =>
                              setApprovalNotes((notes) => ({
                                ...notes,
                                [approval.approval_id]: event.target.value,
                              }))
                            }
                            maxLength={1000}
                            placeholder="Optional note"
                          />
                        </label>
                      </div>
                      <div className="approval-actions">
                        <span className="expiry" aria-label="Seconds until approval expires">
                          {approvalSecondsLeft(approval, clock)}s left
                        </span>
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => void decideApproval(approval.approval_id, "approve")}
                          disabled={resolvingApprovals.has(approval.approval_id)}
                          aria-busy={resolvingApprovals.has(approval.approval_id)}
                        >
                          {resolvingApprovals.has(approval.approval_id) ? <><span className="micro-spinner" aria-hidden="true" />Working…</> : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => void decideApproval(approval.approval_id, "reject")}
                          disabled={resolvingApprovals.has(approval.approval_id)}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel transactions-panel" id="transactions" aria-labelledby="transactions-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Real-time activity</p>
                  <h2 id="transactions-title">Live transaction feed</h2>
                </div>
                <div className="activity-meta">
                  <span className={`activity-connection ${state.connected ? "is-live" : "is-reconnecting"}`}>
                    <i aria-hidden="true" />
                    {state.connected ? "Live" : "Reconnecting"}
                  </span>
                  <span className="panel-meta">{snapshotLoaded ? `${activityTransactions.length} in window` : "Waiting for data"}</span>
                </div>
              </div>
              <div className="table-wrap transactions-table-wrap" role="region" aria-label="Recent transactions" tabIndex={0}>
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Agent</th>
                      <th scope="col">Resource</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
                    {activityTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="table-empty">
                          <strong>{snapshotLoaded ? "No transactions yet" : "Transaction feed unavailable"}</strong>
                          <span>{snapshotLoaded ? "Run a demo to see payment activity here." : "Reconnect the gateway to load recent activity."}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="panel audit-panel" id="audit" aria-labelledby="audit-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Decision record</p>
                <h2 id="audit-title">Audit log</h2>
              </div>
              <span className="panel-meta">{snapshotLoaded ? `${visibleAudit.length} entries` : "Waiting for data"}</span>
            </div>
            <div className="filters">
              <label>
                <span>Event</span>
                <Dropdown
                  className="filter-dropdown"
                  label="Filter by event"
                  value={filterEvent}
                  options={[
                    { value: "", label: "All events" },
                    ...[...new Set(state.audit.map((entry) => entry.event))]
                      .sort()
                      .map((event) => ({ value: event, label: event })),
                  ]}
                  onChange={setFilterEvent}
                />
              </label>
              <label>
                <span>Agent</span>
                <Dropdown
                  className="filter-dropdown"
                  label="Filter by agent"
                  value={filterAgent}
                  options={[
                    { value: "", label: "All agents" },
                    ...state.agents.map((entry) => ({ value: entry.id, label: entry.id })),
                  ]}
                  onChange={setFilterAgent}
                />
              </label>
              <label className="search-field">
                <span>Search ref / PI id</span>
                <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="pi_…" />
              </label>
            </div>
            <div className="table-wrap audit-table-wrap" role="region" aria-label="Decision record entries" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Event</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Reference / details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAudit.map((entry) => <AuditRow key={entry.id} entry={entry} />)}
                  {visibleAudit.length === 0 && <tr><td colSpan={6} className="table-empty">No audit entries match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="readonly-note">Append-only record · Read only</p>
          </section>
        </main>
        <footer>AgentPaymentGaurd <span>Policy enforcement · Payment intent integrity · Auditable decisions</span></footer>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }): JSX.Element {
  return (
    <tr className="transaction-row">
      <td>{formatTime(transaction.created_at)}</td>
      <td>{transaction.agent_id}</td>
      <td>{transaction.resource_id}</td>
      <td>{amount(transaction.amount)}</td>
      <td><StatusChip value={transaction.status} /></td>
      <td className="reason-cell" title={transaction.reason}>{transaction.reason}</td>
    </tr>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }): JSX.Element {
  let detail = "No additional detail";
  if (entry.detail) {
    try {
      detail = JSON.stringify(JSON.parse(entry.detail), null, 2);
    } catch {
      detail = entry.detail;
    }
  }
  return (
    <tr>
      <td>{formatTime(entry.ts)}</td>
      <td><StatusChip value={entry.event} /></td>
      <td>{entry.agent_id ?? "—"}</td>
      <td>{entry.reason ?? "—"}</td>
      <td>{amount(entry.amount)}</td>
      <td>
        <details>
          <summary>{entry.ref_id ?? "View detail"}</summary>
          <pre>{detail}</pre>
        </details>
      </td>
    </tr>
  );
}
