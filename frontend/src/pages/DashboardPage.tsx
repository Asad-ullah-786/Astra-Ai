import { useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Chrome,
  Circle,
  Code2,
  Cpu,
  Database,
  Github,
  ExternalLink,
  ListTodo,
  MessageSquare,
  MousePointer2,
  PlugZap,
  Search,
  Settings2,
  Sparkles,
  Star,
  Timer,
  Download,
  X,
  type LucideIcon,
  Waves,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { AstraCore } from "../components/AstraCore.tsx";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import { formatGigabytes, formatPercent } from "../lib/format.ts";
import { launchApplication } from "../services/api.ts";
import { captureScreenFrame, downloadBlob } from "../services/screenshot.ts";
import { getMissionStatus, getTimelineTasks, type MissionRange } from "../lib/mission.ts";
import { getLLMStatusCards, getLocalModelOverviewCards } from "../lib/llmProviders.ts";
import type { ActivityItem, ModuleInfo } from "../types/index.ts";

const AGENT_MODULES = [
  { id: "ai", name: "Coding Agent", icon: Code2, to: "/chat" },
  { id: "research", name: "Research Agent", icon: Search, to: "/research" },
  { id: "memory", name: "Memory Agent", icon: Brain, to: "/memory" },
  { id: "automation", name: "Browser Agent", icon: Chrome, to: "/automation" },
  { id: "productivity", name: "Task Agent", icon: ListTodo, to: "/tasks" },
  { id: "system_monitor", name: "System Agent", icon: Cpu, to: "/system" },
] satisfies Array<{ id: string; name: string; icon: LucideIcon; to: string }>;

const LOCAL_MODEL_STATUS_ICONS = {
  ollama: Bot,
  mistral: Cpu,
  llama: Brain,
  qwen: BrainCircuit,
  deepseek: Waves,
  phi: Sparkles,
  gemma: Star,
} satisfies Record<ReturnType<typeof getLocalModelOverviewCards>[number]["id"], LucideIcon>;

const LLM_STATUS_ICONS = {
  mistral: Cpu,
  llama: Brain,
  openai: Sparkles,
  gemini: Star,
  qwen: BrainCircuit,
  deepseek: Waves,
  phi: Cpu,
  cursor: MousePointer2,
  copilot: Bot,
} satisfies Record<string, LucideIcon>;

function stateClass(status: string): string {
  return status === "online" ? "is-online" : status === "offline" ? "is-offline" : "is-pending";
}

function formatRelative(value: string): string {
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (ageMinutes < 1) return "now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  return `${Math.floor(ageMinutes / 60)}h ago`;
}

function formatMissionTime(value: string | null): string {
  if (!value) return "ANYTIME";
  const due = new Date(value);
  if (due.toDateString() === new Date().toDateString()) {
    return due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return due.toLocaleDateString([], { month: "short", day: "numeric" });
}

function FeedIcon({ item }: { item: ActivityItem }) {
  const Icon =
    item.source === "chat" ? MessageSquare :
      item.source === "system" ? Cpu :
        item.source === "database" ? Database : Activity;
  return <Icon className="size-4" aria-hidden="true" />;
}

function AgentTile({ module }: { module: ModuleInfo }) {
  const definition = AGENT_MODULES.find((item) => item.id === module.id);
  const Icon = definition?.icon ?? Circle;
  const status =
    module.status === "online" ? "Active · available" :
      module.status === "offline" ? "Offline" : "Not configured";
  return (
    <NavLink
      to={definition?.to ?? "/agents"}
      className={`agent-tile ${stateClass(module.status)}`}
      data-module={module.id}
      title={module.summary}
    >
      <span className="agent-icon" data-module={module.id}><Icon className="size-4" /></span>
      <span className="agent-copy">
        <strong>{definition?.name ?? module.name}</strong>
        <small>{status}</small>
      </span>
      {module.status === "online" ? <CheckCircle2 className="agent-check size-4" /> : <span className="agent-dot" />}
    </NavLink>
  );
}

function SystemGauge({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null;
  detail: string;
}) {
  const safePercent = percent === null ? 0 : Math.max(0, Math.min(percent, 100));
  return (
    <div className="system-gauge">
      <div className="gauge-ring" style={{ "--gauge-progress": `${safePercent}%` } as CSSProperties}>
        <span>{formatPercent(percent)}</span>
      </div>
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ActivitySparkline({ activities }: { activities: ActivityItem[] }) {
  const [today] = useState(() => new Date());
  const counts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = date.toLocaleDateString();
    return activities.filter((item) => new Date(item.created_at).toLocaleDateString() === key).length;
  });
  const max = Math.max(1, ...counts);
  const points = counts
    .map((count, index) => `${8 + index * 28},${68 - (count / max) * 48}`)
    .join(" ");
  return (
    <svg className="memory-sparkline" viewBox="0 0 176 78" role="img" aria-label="Activity over seven days">
      <defs>
        <filter id="memory-graph-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[14, 38, 62].map((y) => <path key={y} d={`M4 ${y}H172`} className="memory-grid-line" />)}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".38" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.8" filter="url(#memory-graph-glow)" />
      {counts.map((count, index) => (
        <g key={`${index}-${count}`}>
          <circle cx={8 + index * 28} cy={68 - (count / max) * 48} r="4.3" fill="currentColor" opacity=".16" />
          <circle cx={8 + index * 28} cy={68 - (count / max) * 48} r="2.2" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

function QuickExternalLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  if (href.startsWith("/")) {
    return (
      <NavLink to={href} className="quick-command">
        <Icon className="size-4" />
        <span>{label}</span>
        <ArrowRight className="quick-arrow size-3" />
      </NavLink>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="quick-command">
      <Icon className="size-4" />
      <span>{label}</span>
      <ArrowRight className="quick-arrow size-3" />
    </a>
  );
}

function QuickAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="quick-command" disabled={disabled} onClick={onClick}>
      <Icon className="size-4" />
      <span>{label}</span>
      <ArrowRight className="quick-arrow size-3" />
    </button>
  );
}

export function DashboardPage() {
  const { health, stats, conversations, messages, activities, activityError, modules, aiStatus, state, tasks, memories } = useAstra();
  const navigate = useNavigate();
  const llmStatusCards = getLLMStatusCards(aiStatus);
  const localModelCards = getLocalModelOverviewCards(aiStatus);
  const geminiConnected = Boolean(aiStatus?.gemini?.connected);
  const openaiConnected = Boolean(aiStatus?.openai?.connected);
  const providerConnected = Boolean(aiStatus && (aiStatus.connected || geminiConnected || openaiConnected));
  const recentActivities = activities.slice(0, 6);
  const [workingAction, setWorkingAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [agentSetup, setAgentSetup] = useState<"cursor" | "copilot" | null>(null);
  const [agentActionMessage, setAgentActionMessage] = useState("");
  const [missionRange, setMissionRange] = useState<MissionRange>("today");
  const [now] = useState(() => new Date());
  const timelineTasks = getTimelineTasks(tasks, missionRange, now);
  const agentSetupCard = agentSetup
    ? llmStatusCards.find((card) => card.id === agentSetup)
    : null;
  const agentInstalled = agentSetup
    ? Boolean(aiStatus?.clients?.[agentSetup])
    : false;

  async function launch(application: "code" | "chrome" | "settings") {
    setWorkingAction(application);
    setActionError("");
    try {
      await launchApplication(application);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The quick command failed.");
    } finally {
      setWorkingAction("");
    }
  }

  async function takeScreenshot() {
    setWorkingAction("screenshot");
    setActionError("");
    try {
      const image = await captureScreenFrame();
      downloadBlob(image, `astra-screenshot-${new Date().toISOString().replaceAll(":", "-")}.png`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Screen capture was cancelled or failed.");
    } finally {
      setWorkingAction("");
    }
  }

  async function openAgentApplication(application: "code" | "cursor") {
    setWorkingAction(application);
    setAgentActionMessage("");
    setActionError("");
    try {
      const result = await launchApplication(application);
      setAgentActionMessage(result.message);
    } catch (caught) {
      setAgentActionMessage(caught instanceof Error ? caught.message : "The application could not be opened.");
    } finally {
      setWorkingAction("");
    }
  }

  function openAgentWebsite(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="astra-dashboard">
      <div className="dashboard-row dashboard-row-top">
        <Panel title="AI CORE OVERVIEW" className="dashboard-panel ai-overview-panel">
          <div className="ai-model-list">
            {localModelCards.map((card) => {
              const Icon = LOCAL_MODEL_STATUS_ICONS[card.id];
              return (
                <div
                  className={`ai-model-row ${card.selected ? "is-selected" : ""}`}
                  data-model={card.id}
                  data-state={card.state}
                  key={card.id}
                  title={card.modelName ? `${card.modelName}${card.selected ? " · selected" : ""}` : card.status}
                >
                  <span className={`ai-model-orb ${card.state === "unavailable" ? "is-muted" : ""}`} data-model={card.id}>
                    <Icon className="size-4" />
                  </span>
                  <span className="ai-model-copy">
                    <strong>{health?.cloud_deployment && card.id === "ollama" ? "Hosted Ollama" : card.name}</strong>
                    <small>{card.status}</small>
                  </span>
                  <i className={`status-light ${card.state === "connected" || card.state === "available" ? "is-green" : ""}`} />
                </div>
              );
            })}
          </div>
          <NavLink to="/settings" className="panel-action">Manage providers <ArrowRight className="size-3" /></NavLink>
        </Panel>

        <NavLink
          to="/voice"
          className="dashboard-core-frame"
          aria-label="Open ASTRA voice assistant"
          title="Open voice assistant"
        >
          <div className="core-stars" aria-hidden="true" />
          <div className="core-copy">
            <span className="core-eyebrow">
              {aiStatus?.selected_model?.startsWith("openai:") && openaiConnected
                ? "OPENAI CLOUD MODEL ONLINE"
                : aiStatus?.selected_model?.startsWith("gemini:") && geminiConnected
                ? "GEMINI CLOUD MODEL ONLINE"
                : aiStatus?.connected && aiStatus.selected_model
                  ? health?.cloud_deployment ? "HOSTED OLLAMA MODEL ONLINE" : "LOCAL MODEL ONLINE"
                  : aiStatus?.connected
                    ? health?.cloud_deployment ? "HOSTED OLLAMA ONLINE" : "LOCAL SERVICE ONLINE"
                    : geminiConnected
                      ? "GEMINI API AVAILABLE"
                      : "AI CORE OFFLINE"}
            </span>
            <AstraCore state={state} />
            <small className="core-version">{health?.version ? `v${health.version}` : "Local assistant"}</small>
          </div>
          <span className="core-state">{state.toUpperCase()}</span>
        </NavLink>

        <Panel title="LIVE INTELLIGENCE FEED" className="dashboard-panel live-feed-panel">
          <div className="feed-header">
            <span className={`feed-live ${activityError ? "is-stale" : ""}`}>
              <i /> {activityError ? "RETRYING" : "LIVE"}
            </span>
          </div>
          <ul className="intelligence-feed">
            {recentActivities.map((item) => (
              <li key={item.id}>
                <span className="feed-icon"><FeedIcon item={item} /></span>
                <span className="feed-message">
                  <strong>{item.message}</strong>
                </span>
                <time>{formatRelative(item.created_at)}</time>
              </li>
            ))}
            {recentActivities.length === 0 ? <li className="empty-feed">New ASTRA activity will appear here.</li> : null}
            {activityError ? <li className="activity-feed-error" role="status">{activityError}</li> : null}
          </ul>
          <NavLink to="/activity" className="panel-action">View all activity <ArrowRight className="size-3" /></NavLink>
        </Panel>
      </div>

      <div className="dashboard-row dashboard-row-middle">
        <Panel title="ACTIVE AGENTS" className="dashboard-panel agents-panel">
          <div className="agents-toolbar">
            <span>Only connected capabilities are marked active.</span>
            <NavLink to="/agents">View all <ArrowRight className="size-3" /></NavLink>
          </div>
          <div className="agent-grid">
            {AGENT_MODULES.map((agent) => {
              const module = modules.find((item) => item.id === agent.id);
              return module ? <AgentTile key={agent.id} module={module} /> : null;
            })}
          </div>
        </Panel>

        <Panel title="MISSION TIMELINE" className="dashboard-panel mission-panel">
          <label className="sr-only" htmlFor="mission-range">Mission timeline range</label>
          <select
            id="mission-range"
            className="mission-range-select"
            value={missionRange}
            onChange={(event) => {
              const { value } = event.target;
              if (value === "today" || value === "upcoming" || value === "all") setMissionRange(value);
            }}
          >
            <option value="today">Today</option>
            <option value="upcoming">Next 7 days</option>
            <option value="all">All tasks</option>
          </select>
          <div className="mission-task-list">
            {timelineTasks.map((task) => {
              const status = getMissionStatus(task, now);
              return (
                <div className="mission-task-row" data-status={status} key={task.id}>
                  <time>{formatMissionTime(task.due_at)}</time>
                  <span className="mission-task-dot" aria-label={status} title={status} />
                  <strong title={task.title}>
                    <span>{task.title}</span>
                    <small>{status}</small>
                  </strong>
                </div>
              );
            })}
            {timelineTasks.length === 0 ? (
              <div className="timeline-empty">
                <span className="timeline-track" />
                <Timer className="size-5" />
                <strong>{missionRange === "today" ? "No missions scheduled today" : "No tasks in this time range"}</strong>
                <p>Create or schedule a task to add it to the timeline.</p>
              </div>
            ) : null}
          </div>
          <NavLink to="/calendar" className="panel-action">View full schedule <ArrowRight className="size-3" /></NavLink>
        </Panel>

        <Panel title="QUICK COMMANDS" className="dashboard-panel quick-panel">
          {health?.cloud_deployment ? (
            <>
              <QuickExternalLink href="/automation" label="Pair Local Device" icon={PlugZap} />
              <QuickExternalLink href="/chat" label="Open AI Chat" icon={MessageSquare} />
              <QuickExternalLink href="https://github.com/" label="Open GitHub" icon={Github} />
              <QuickAction
                label={workingAction === "screenshot" ? "Choose Screen..." : "Share Screen"}
                icon={Camera}
                disabled={Boolean(workingAction)}
                onClick={() => void takeScreenshot()}
              />
            </>
          ) : (
            <>
              <QuickAction label={workingAction === "code" ? "Opening VS Code..." : "Open VS Code"} icon={Code2} disabled={Boolean(workingAction)} onClick={() => void launch("code")} />
              <QuickAction label={workingAction === "chrome" ? "Opening Chrome..." : "Open Chrome"} icon={Chrome} disabled={Boolean(workingAction)} onClick={() => void launch("chrome")} />
              <QuickAction label={workingAction === "settings" ? "Opening Settings..." : "Open Windows Settings"} icon={Settings2} disabled={Boolean(workingAction)} onClick={() => void launch("settings")} />
              <QuickExternalLink href="https://github.com/" label="Open GitHub" icon={Github} />
              <QuickAction
                label={workingAction === "screenshot" ? "Capturing..." : "Take Screenshot"}
                icon={Camera}
                disabled={Boolean(workingAction)}
                onClick={() => void takeScreenshot()}
              />
            </>
          )}
          {actionError ? (
            <p className="text-xs text-astra-danger" role="alert">
              {actionError}
              {actionError.includes("Connect this browser") ? (
                <> <NavLink to="/automation" className="underline">Pair this device</NavLink>.</>
              ) : null}
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="dashboard-row dashboard-row-bottom">
        <Panel title={health?.cloud_deployment ? "THIS DEVICE SYSTEM MONITOR" : "SYSTEM MONITOR"} className="dashboard-panel monitor-panel">
          <div className="gauge-grid">
            <SystemGauge label="CPU" percent={stats?.cpu_percent ?? null} detail={stats ? `${stats.cpu_count} logical CPUs` : "Waiting"} />
            <SystemGauge label="RAM" percent={stats?.ram_percent ?? null} detail={stats ? `${formatGigabytes(stats.ram_used_gb)} / ${formatGigabytes(stats.ram_total_gb)}` : "Waiting"} />
            <SystemGauge label="DISK" percent={stats?.disk_percent ?? null} detail={stats ? `${formatGigabytes(stats.disk_free_gb)} free` : "Waiting"} />
          </div>
        </Panel>

        <Panel title="MEMORY INSIGHTS" className="dashboard-panel memory-panel">
          <div className="memory-insight-content">
            <ActivitySparkline activities={activities} />
            <div className="memory-counts">
              <span><small>CONVERSATIONS</small><strong>{conversations.length}</strong></span>
              <span><small>ACTIVE TURNS</small><strong>{messages.length}</strong></span>
              <span><small>MEMORIES</small><strong>{memories.length}</strong></span>
            </div>
          </div>
          <NavLink to="/memory" className="panel-action">Memory map <ArrowRight className="size-3" /></NavLink>
        </Panel>

        <Panel title="LLM STATUS" className="dashboard-panel llm-panel">
          <div className="llm-heading">
            <span>PROVIDERS & MODELS</span>
            <span className={aiStatus == null ? "" : providerConnected ? "is-green" : "is-red"}>
              <i /> {aiStatus == null ? "CHECKING" : providerConnected ? "CONNECTED" : "ALL OFFLINE"}
            </span>
          </div>
          <div className="llm-model-grid">
            {llmStatusCards.map((card) => {
              const Icon = LLM_STATUS_ICONS[card.id];
              const isAgentCard = card.id === "cursor" || card.id === "copilot";
              return (
                <button
                  type="button"
                  className="llm-model"
                  data-state={card.state}
                  key={card.id}
                  onClick={() => {
                    if (isAgentCard) {
                      setAgentActionMessage("");
                      setAgentSetup(card.id as "cursor" | "copilot");
                      return;
                    }
                    const provider = card.id === "mistral"
                      || card.id === "llama"
                      || card.id === "qwen"
                      || card.id === "deepseek"
                      || card.id === "phi"
                      ? "ollama"
                      : card.id;
                    navigate(`/settings?provider=${provider}`);
                  }}
                  aria-label={`View ${card.name} settings and details`}
                >
                  <span className="llm-provider-icon" data-provider={card.id}><Icon className="size-3.5" /></span>
                  <span><strong>{card.name}</strong><small>{card.status}</small></span>
                  {card.state === "connected" ? <CheckCircle2 className="llm-check size-3.5" /> : null}
                </button>
              );
            })}
          </div>
          <NavLink to="/settings" className="panel-action">Manage providers <ArrowRight className="size-3" /></NavLink>
        </Panel>
      </div>

      {agentSetupCard ? (
        <div className="agent-connect-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAgentSetup(null);
        }}>
          <section className="agent-connect-dialog" role="dialog" aria-modal="true" aria-label={`Connect ${agentSetupCard.name}`}>
            <button
              type="button"
              className="agent-connect-close"
              aria-label="Close"
              onClick={() => setAgentSetup(null)}
            >
              <X className="size-4" />
            </button>
            <span className="agent-connect-icon">
              {agentSetup === "cursor" ? <MousePointer2 className="size-5" /> : <Bot className="size-5" />}
            </span>
            <span className="agent-connect-eyebrow">{agentInstalled ? "READY TO CONNECT" : "SETUP AVAILABLE"}</span>
            <h2>{agentSetupCard.name}</h2>
            <p>
              {agentSetup === "cursor"
                ? "Open Cursor and connect its agent to this PC. You can also install Cursor if it is not available."
                : "Open VS Code and connect GitHub Copilot Agent. If VS Code or the agent extension is missing, install it from the official source."}
            </p>
            <div className="agent-connect-actions">
              {agentInstalled ? (
                <button
                  type="button"
                  className="agent-connect-primary"
                  disabled={Boolean(workingAction)}
                  onClick={() => void openAgentApplication(agentSetup === "cursor" ? "cursor" : "code")}
                >
                  <PlugZap className="size-4" />
                  {workingAction ? "Opening..." : `Open ${agentSetupCard.name}`}
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-connect-primary"
                  onClick={() => openAgentWebsite(
                    agentSetup === "cursor"
                      ? "https://cursor.com/download"
                      : "https://code.visualstudio.com/download",
                  )}
                >
                  <Download className="size-4" />
                  {agentSetup === "cursor" ? "Install Cursor" : "Install VS Code"}
                </button>
              )}
              <button
                type="button"
                className="agent-connect-secondary"
                onClick={() => openAgentWebsite(
                  agentSetup === "cursor"
                    ? "https://cursor.com/docs"
                    : "https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat",
                )}
              >
                <ExternalLink className="size-4" />
                {agentSetup === "cursor" ? "Connect Cursor Agent" : "Connect Copilot Agent"}
              </button>
            </div>
            <NavLink to="/automation" className="agent-connect-pair" onClick={() => setAgentSetup(null)}>
              Pair or manage the local ASTRA companion
              <ArrowRight className="size-3" />
            </NavLink>
            {agentActionMessage ? (
              <p className="agent-connect-message" role="status">{agentActionMessage}</p>
            ) : null}
          </section>
        </div>
      ) : null}

    </div>
  );
}
