import { Activity, ArrowUpRight, Brain, Database, Globe2, ListTodo, Search, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";

const AGENTS = [
  { id: "ai", name: "AI Core Agent", description: "Answers prompts using the selected local or cloud model.", icon: Brain, to: "/chat" },
  { id: "research", name: "Research Agent", description: "Searches the public web and returns linked sources.", icon: Search, to: "/research" },
  { id: "memory", name: "Memory Agent", description: "Finds and manages notes and local knowledge.", icon: Database, to: "/memory" },
  { id: "automation", name: "Browser & Automation Agent", description: "Runs approved desktop actions and user-selected screen capture.", icon: Globe2, to: "/automation" },
  { id: "productivity", name: "Task Agent", description: "Creates and tracks tasks, due dates, and reminders.", icon: ListTodo, to: "/tasks" },
  { id: "system_monitor", name: "System Agent", description: "Reports current CPU, memory, disk, battery, and host status.", icon: Activity, to: "/system" },
] satisfies Array<{ id: string; name: string; description: string; icon: LucideIcon; to: string }>;

function statusLabel(status: string): string {
  return status === "online" ? "READY" : status === "offline" ? "OFFLINE" : "CHECKING";
}

export function AgentsPage() {
  const { modules } = useAstra();
  const readyCount = AGENTS.filter((agent) => modules.find((module) => module.id === agent.id)?.status === "online").length;

  return (
    <div className="mx-auto max-w-5xl">
      <Panel title="AGENT WORKFLOWS">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm leading-6 text-astra-muted">
            Agents are role-based workflows. Open one to run its dedicated feature; ASTRA does not run background agents autonomously.
          </p>
          <span className="rounded-full border border-astra-cyan/25 px-3 py-1 font-mono text-xs text-astra-cyan">
            {readyCount} / {AGENTS.length} READY
          </span>
        </div>
        <div className="mt-4 divide-y divide-white/10">
          {AGENTS.map(({ id, name, description, icon: Icon, to }) => {
            const module = modules.find((item) => item.id === id);
            const status = module?.status ?? "checking";
            return (
              <article key={id} className="flex min-w-0 flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-astra-cyan/25 bg-cyan-950/30 text-astra-cyan">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-sm font-semibold text-astra-text">{name}</h3>
                    <span className={`font-mono text-[0.713rem] ${status === "online" ? "text-astra-ok" : status === "offline" ? "text-astra-danger" : "text-amber-300"}`}>
                      {statusLabel(status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-astra-muted">{description}</p>
                  <p className="mt-1 text-[0.782rem] text-astra-muted">{module?.summary ?? "Waiting for ASTRA service status."}</p>
                </div>
                <NavLink
                  to={to}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-astra-cyan/30 px-3 py-2 text-xs text-astra-cyan transition hover:border-astra-cyan/70 hover:text-white"
                >
                  Open workflow <ArrowUpRight className="size-3.5" />
                </NavLink>
              </article>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
