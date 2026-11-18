import { ArrowUpRight, Brain, CalendarDays, Database, Globe2, ListTodo, Mic, Monitor, Search, WandSparkles } from "lucide-react";
import { NavLink } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import type { LucideIcon } from "lucide-react";

const SKILLS = [
  { category: "AI & research", moduleId: "ai", name: "AI model chat", description: "Run a prompt with the selected local Ollama or configured cloud model.", to: "/chat", icon: Brain },
  { category: "AI & research", moduleId: "research", name: "Web search", description: "Search the public web and review source links.", to: "/research", icon: Search },
  { category: "Memory & knowledge", moduleId: "memory", name: "Personal memory", description: "Save, update, and remove notes you choose to keep.", to: "/memory", icon: Database },
  { category: "Memory & knowledge", moduleId: "memory", name: "Knowledge search", description: "Search saved memories and conversation titles.", to: "/knowledge", icon: Globe2 },
  { category: "Planning", moduleId: "productivity", name: "Task manager", description: "Create, schedule, edit, complete, and delete local tasks.", to: "/tasks", icon: ListTodo },
  { category: "Planning", moduleId: "productivity", name: "Calendar", description: "Review scheduled tasks and due dates.", to: "/calendar", icon: CalendarDays },
  { category: "Device & automation", moduleId: "automation", name: "Windows quick actions", description: "Launch approved apps or capture one screen frame with your permission.", to: "/automation", icon: WandSparkles },
  { category: "Device & automation", moduleId: "system_monitor", name: "System monitor", description: "View live CPU, memory, disk, battery, and host details.", to: "/system", icon: Monitor },
  { category: "Device & automation", moduleId: "voice", name: "Push-to-talk voice", description: "Start recording only when you press the microphone button.", to: "/voice", icon: Mic },
] satisfies Array<{ category: string; moduleId: string; name: string; description: string; to: string; icon: LucideIcon }>;

export function SkillsPage() {
  const { modules } = useAstra();

  return (
    <div className="mx-auto max-w-5xl">
      <Panel title="LOCAL TOOLS & SKILLS">
        <p className="mb-4 text-sm leading-6 text-astra-muted">
          This catalog lists individual capabilities, grouped by what they do. Use Agents for role-based workflows and Tasks for managing reminders.
        </p>
        {[...new Set(SKILLS.map((skill) => skill.category))].map((category) => (
          <section key={category} className="mt-5">
            <h3 className="mb-2 font-display text-xs tracking-[0.12em] text-astra-cyan">{category.toUpperCase()}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {SKILLS.filter((skill) => skill.category === category).map(({ moduleId, name, description, to, icon: Icon }) => {
                const module = modules.find((item) => item.id === moduleId);
                const status = module?.status ?? "checking";
                return (
                  <NavLink
                    key={name}
                    to={to}
                    className="flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-astra-cyan/40"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-astra-cyan" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-white">{name}</strong>
                      <small className="mt-1 block text-xs leading-5 text-astra-muted">{description}</small>
                      <small className={`mt-2 block font-mono text-[0.62rem] ${status === "online" ? "text-astra-ok" : status === "offline" ? "text-astra-danger" : "text-amber-300"}`}>
                        {status === "online" ? "AVAILABLE" : status.toUpperCase()}
                      </small>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-astra-muted" />
                  </NavLink>
                );
              })}
            </div>
          </section>
        ))}
      </Panel>
    </div>
  );
}
