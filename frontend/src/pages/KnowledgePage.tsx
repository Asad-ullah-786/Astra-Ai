import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { NavLink } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";

export function KnowledgePage() {
  const { memories } = useAstra();
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const filteredMemories = useMemo(
    () => memories.filter((item) => `${item.title}\n${item.content}`.toLocaleLowerCase().includes(term)),
    [memories, term],
  );
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Panel title="LOCAL KNOWLEDGE BASE">
        <p className="mb-3 text-sm text-astra-muted">
          Search memories you explicitly saved. Notes stay on this PC and are not uploaded to a cloud index.
        </p>
        <label className="flex items-center gap-2 rounded-xl border border-astra-cyan/25 bg-black/30 px-3">
          <Search className="size-4 shrink-0 text-astra-cyan" />
          <span className="sr-only">Search local knowledge</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved memory titles and notes..."
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-astra-muted"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xs tracking-[0.16em] text-astra-cyan">SAVED MEMORIES · {filteredMemories.length}</h3>
          <NavLink to="/memory" className="text-xs text-astra-cyan hover:text-white">Manage memories</NavLink>
        </div>
        <ul className="mt-2 space-y-2">
          {filteredMemories.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-sm text-white">
                <BookOpen className="size-4 shrink-0 text-emerald-300" />
                <strong className="truncate">{item.title}</strong>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-astra-muted">{item.content}</p>
              <time className="mt-2 block font-mono text-[0.65rem] text-slate-500">
                Updated {new Date(item.updated_at).toLocaleDateString()}
              </time>
            </li>
          ))}
          {filteredMemories.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-astra-muted">
              No matching saved memories. <NavLink to="/memory" className="text-astra-cyan hover:text-white">Save a memory</NavLink>
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
