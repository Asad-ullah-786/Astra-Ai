import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Crown,
  Cpu,
  Globe2,
  LayoutGrid,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  ShieldCheck,
  Wifi,
  Wrench,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Mic } from "lucide-react";
import { CommandBar } from "../components/CommandBar.tsx";
import { Waveform } from "../components/Waveform.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import { useClock } from "../hooks/useClock.ts";
import {
  apiGet,
  clearPersonalProviderCredentials,
  createGuestSession,
  getApiToken,
} from "../services/api.ts";
import type { AssistantState, CommandSendOptions } from "../types/index.ts";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard, end: true },
  { to: "/chat", label: "AI Core", icon: Brain },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/skills", label: "Tools & Skills", icon: Wrench },
  { to: "/research", label: "Web Access", icon: Globe2 },
];

function linkClass(active: boolean): string {
  return `astra-nav-link ${active ? "is-active" : ""}`;
}

function getTalkStatus(state: AssistantState): string {
  switch (state) {
    case "listening":
      return "MICROPHONE ACTIVE";
    case "processing":
      return "PROCESSING COMMAND";
    case "thinking":
      return "THINKING";
    case "speaking":
      return "RESPONDING";
    case "executing":
      return "EXECUTING ACTION";
    case "completed":
      return "READY FOR NEXT COMMAND";
    case "error":
      return "ACTION NEEDS ATTENTION";
    default:
      return "READY · TEXT OR VOICE";
  }
}

const noAnalyser = () => null;

export function AppShell() {
  const {
    health,
    online,
    settings,
    modules,
    conversations,
    tasks,
    state,
    commandError,
    sendCommand,
    connectionError,
    refresh,
    saveApiToken,
  } = useAstra();
  const now = useClock();
  const location = useLocation();
  const navigate = useNavigate();
  const isChatPage = location.pathname === "/chat";
  const isVoicePage = location.pathname === "/voice";
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [apiToken, setApiToken] = useState(() => getApiToken());
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const displayName = settings?.user_display_name ?? "Operator";
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const pendingTaskCount = tasks.filter((task) => !task.completed).length;
  const tokenRequired = Boolean(
    health?.auth_required &&
    (connectionError?.startsWith("Guest access is required") ||
      connectionError?.startsWith("This backend requires an API token.")),
  );

  useEffect(() => {
    const updateNetwork = () => setNetworkOnline(navigator.onLine);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  useEffect(() => {
    function dismissMenus(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!appMenuRef.current?.contains(event.target)) setAppMenuOpen(false);
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAppMenuOpen(false);
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", dismissMenus);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissMenus);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  function navigateSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim().toLocaleLowerCase();
    const match = NAV.find((item) => item.label.toLocaleLowerCase().includes(term));
    if (!match) {
      setSearchError("No matching ASTRA page");
      return;
    }

    setSearchError("");
    setQuery("");
    navigate(match.to);
  }

  async function applyApiToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = apiToken.trim();
    if (!cleaned) {
      setTokenError("Paste the ASTRA_API_TOKEN configured for this Vercel deployment.");
      return;
    }

    setTokenSubmitting(true);
    setTokenError("");
    saveApiToken(cleaned);
    try {
      await apiGet("/api/v1/settings");
      await refresh();
    } catch (error) {
      setTokenError(
        error instanceof Error
          ? error.message
          : "The token could not be verified. Check it and try again.",
      );
    } finally {
      setTokenSubmitting(false);
    }
  }

  async function continueAsGuest() {
    setTokenSubmitting(true);
    setTokenError("");
    try {
      const session = await createGuestSession();
      saveApiToken(session.access_token);
      await apiGet("/api/v1/settings");
      await refresh();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not create a guest workspace.");
    } finally {
      setTokenSubmitting(false);
    }
  }

  function sendFromConsole(text: string, options?: CommandSendOptions) {
    if (!text.trim()) return Promise.resolve(null);
    navigate("/chat");
    return sendCommand(text, options);
  }

  return (
    <div className={`astra-shell grid-fade ${focusMode ? "focus-mode" : ""}`}>
      <aside className="astra-sidebar">
        <NavLink to="/" className="astra-brand" aria-label="ASTRA command center">
          <span className="astra-brand-orb"><Sparkles className="size-5" /></span>
          <span>
            <strong>ASTRA</strong>
            <small>VIRTUAL ASSISTANT</small>
          </span>
        </NavLink>

        <nav className="astra-nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-module={item.to}
              className={({ isActive }) => linkClass(isActive)}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
              {item.to === "/tasks" && pendingTaskCount > 0 ? (
                <span className="astra-nav-count" aria-label={`${pendingTaskCount} open tasks`}>{pendingTaskCount}</span>
              ) : item.to === "/conversations" && conversations.length > 0 ? (
                <span className="astra-nav-count" aria-label={`${conversations.length} conversations`}>{conversations.length}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <section className="astra-voice-card" aria-label="Voice status">
          <div className="astra-card-heading">
            <span>VOICE STATUS</span>
            <span className="astra-live-dot" />
          </div>
          <Waveform active={false} getAnalyser={() => null} />
          <p className="astra-voice-state">Microphone is off until you press record.</p>
          <NavLink to="/voice" className="astra-voice-link">
            <Mic className="size-4" /> TAP TO SPEAK
          </NavLink>
          <p className="astra-privacy-note">
            {health?.cloud_deployment
              ? "Browser speech is available where supported."
              : modules.find((item) => item.id === "voice")?.status === "online"
                ? "Local push-to-talk is ready."
                : "Install the local speech model to enable transcription."}
          </p>
        </section>

        <button
          type="button"
          className={`astra-focus-button ${focusMode ? "is-active" : ""}`}
          aria-pressed={focusMode}
          onClick={() => setFocusMode((active) => !active)}
        >
          <Sparkles className="size-3.5" />
          {focusMode ? "EXIT FOCUS MODE" : "FOCUS MODE"}
        </button>
      </aside>

      <div className="astra-workspace">
        <header className="astra-topbar">
          <div className="astra-system-status">
            <span>SYSTEM STATUS</span>
            <span className={online ? "is-online" : "is-offline"}>
              <i /> {online ? (tokenRequired ? "AUTH REQUIRED" : "ONLINE") : "OFFLINE"}
            </span>
          </div>

          <div className="astra-clock" aria-label={`${date}, ${clock}`}>
            <span>{date}</span>
            <strong>{clock}</strong>
          </div>

          <div className="astra-top-actions">
            <form className="astra-search" onSubmit={navigateSearch} role="search">
              <Search className="size-3.5 shrink-0" />
              <input
                aria-label="Search ASTRA pages"
                list="astra-page-list"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchError("");
                }}
                placeholder="Search..."
              />
              <datalist id="astra-page-list">
                {NAV.map((item) => <option key={item.to} value={item.label} />)}
              </datalist>
              {searchError ? <span className="astra-search-error" role="status">{searchError}</span> : null}
            </form>
            <div className="astra-menu-anchor" ref={appMenuRef}>
              <button
                type="button"
                className="astra-top-icon"
                aria-label="Open applications"
                aria-expanded={appMenuOpen}
                aria-haspopup="true"
                title="Applications"
                onClick={() => setAppMenuOpen((open) => !open)}
              >
                <LayoutGrid className="size-4" />
              </button>
              {appMenuOpen ? (
                <nav className="astra-header-dropdown astra-app-dropdown" aria-label="Applications">
                  {NAV.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `astra-menu-link ${isActive ? "is-active" : ""}`}
                      onClick={() => setAppMenuOpen(false)}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </nav>
              ) : null}
            </div>
            <NavLink to="/activity" className="astra-top-icon" aria-label="Activity feed" title="Activity feed">
              <Bell className="size-4" />
            </NavLink>
            <NavLink to="/settings" className="astra-top-icon" aria-label="Settings" title="Settings">
              <Settings className="size-4" />
            </NavLink>
            <div className="astra-menu-anchor" ref={profileMenuRef}>
              <button
                type="button"
                className="astra-operator astra-profile-trigger"
                aria-label={`Open profile menu for ${displayName}`}
                aria-expanded={profileMenuOpen}
                aria-haspopup="true"
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <span>{displayName}</span>
                <span className="astra-avatar"><span /></span>
              </button>
              {profileMenuOpen ? (
                <div className="astra-header-dropdown astra-profile-dropdown">
                  <span className="astra-profile-caption">{health?.cloud_deployment ? "ASTRA ACCOUNT" : "LOCAL ASTRA PROFILE"}</span>
                  <strong>{displayName}</strong>
                  <NavLink to="/settings" className="astra-menu-link" onClick={() => setProfileMenuOpen(false)}>
                    <Settings className="size-4" />
                    <span>Profile & settings</span>
                  </NavLink>
                  <NavLink to="/activity" className="astra-menu-link" onClick={() => setProfileMenuOpen(false)}>
                    <Bell className="size-4" />
                    <span>Activity history</span>
                  </NavLink>
                  {health?.cloud_deployment ? (
                    <button
                      type="button"
                      className="astra-menu-link"
                      onClick={() => {
                        clearPersonalProviderCredentials();
                        saveApiToken("");
                        setProfileMenuOpen(false);
                      }}
                    >
                      <ShieldCheck className="size-4" />
                      <span>Sign out</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {tokenRequired ? (
          <section className="astra-connection-error flex flex-wrap items-center gap-3" aria-label="Backend authentication">
            <p className="m-0 flex-1" role="status">
              {health?.cloud_deployment
                ? "ASTRA cloud is online. Continue as guest to create your private workspace."
                : "Backend is online. Enter its API token to unlock your private data and AI features."}
            </p>
            {health?.cloud_deployment ? (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  type="button"
                  disabled={tokenSubmitting}
                  onClick={() => void continueAsGuest()}
                  className="rounded-lg border border-astra-cyan/40 px-3 py-1.5 text-xs text-astra-cyan disabled:opacity-50"
                >
                  {tokenSubmitting ? "CREATING GUEST..." : "CONTINUE AS GUEST"}
                </button>
              </div>
            ) : (
              <form className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-nowrap" onSubmit={(event) => void applyApiToken(event)}>
                <label className="sr-only" htmlFor="connection-api-token">ASTRA API token</label>
                <input
                  id="connection-api-token"
                  type="password"
                  autoComplete="off"
                  value={apiToken}
                  onChange={(event) => setApiToken(event.target.value)}
                  placeholder="Paste ASTRA_API_TOKEN"
                  className="min-w-0 flex-1 rounded-lg border border-astra-cyan/30 bg-black/50 px-3 py-1.5 text-sm text-astra-text outline-none focus:border-astra-cyan"
                />
                <button
                  type="submit"
                  disabled={tokenSubmitting}
                  className="rounded-lg border border-astra-cyan/40 px-3 py-1.5 text-xs text-astra-cyan disabled:opacity-50"
                >
                  {tokenSubmitting ? "CHECKING..." : "CONNECT"}
                </button>
              </form>
            )}
            {tokenError ? <p className="m-0 w-full" role="alert">{tokenError}</p> : null}
            {!health?.cloud_deployment ? (
              <NavLink to="/settings" className="text-xs text-astra-cyan underline">Token settings</NavLink>
            ) : null}
          </section>
        ) : connectionError ? (
          <p className="astra-connection-error" role="alert">{connectionError}</p>
        ) : null}

        <main className={`astra-content ${location.pathname === "/" ? "is-dashboard" : ""}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="astra-route"
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <footer className={`astra-statusbar ${isChatPage ? "is-chat-page" : ""} ${isVoicePage ? "is-voice-page" : ""}`}>
        <div className="astra-status-tiles">
          <div className="astra-status-tile">
            <Wifi className={`size-4 ${networkOnline ? "text-astra-cyan" : "text-astra-danger"}`} />
            <span>NETWORK<small>{networkOnline ? "Connected" : "Offline"}</small></span>
          </div>
          <div className="astra-status-tile">
            <Cpu className="size-4 text-amber-300" />
            <span>SYSTEM<small>Optimized</small></span>
          </div>
          <div className="astra-status-tile">
            <ShieldCheck className="size-4 text-astra-ok" />
            <span>SECURITY<small>Active</small></span>
          </div>
        </div>

        {!isChatPage && !isVoicePage ? (
          <div className="astra-talk-console">
            <span className="astra-talk-wave">
              <Waveform active={false} getAnalyser={noAnalyser} />
            </span>
            <div className="astra-talk-content">
              <strong>TALK TO ASTRA</strong>
              <CommandBar
                disabled={state === "processing" || state === "thinking" || state === "speaking"}
                onSubmit={sendFromConsole}
              />
              <small className="astra-talk-state" role="status">{getTalkStatus(state)}</small>
              {commandError ? <small className="astra-talk-error" role="alert">{commandError}</small> : null}
            </div>
            <span className="astra-talk-wave is-mirrored">
              <Waveform active={false} getAnalyser={noAnalyser} />
            </span>
          </div>
        ) : null}

        <button
          type="button"
          className={`astra-executive-link ${focusMode ? "is-active" : ""}`}
          aria-pressed={focusMode}
          onClick={() => setFocusMode((active) => !active)}
        >
          <Crown className="size-4" />
          <span>{focusMode ? "EXIT EXECUTIVE MODE" : "EXECUTIVE MODE"}</span>
        </button>
      </footer>
    </div>
  );
}
