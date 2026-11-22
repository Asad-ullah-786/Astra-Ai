import { useMemo, useState } from "react";
import { Clock3, MessageSquare, MessageSquarePlus, Search, Trash2 } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";

function formatConversationDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ConversationsPage() {
  const { conversations, activeConversationId, openConversation, deleteConversation, startNewConversation } = useAstra();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? conversations.filter((item) => item.title.toLocaleLowerCase().includes(term)) : conversations;
  }, [conversations, query]);

  async function open(id: string) {
    setWorkingId(id);
    setError("");
    try {
      await openConversation(id);
      navigate("/chat");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The conversation could not be opened.");
    } finally {
      setWorkingId(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Permanently delete "${title}" and its messages from this PC?`)) return;
    setWorkingId(id);
    setError("");
    try {
      await deleteConversation(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The conversation could not be deleted.");
    } finally {
      setWorkingId(null);
    }
  }

  function newChat() {
    startNewConversation();
    navigate("/chat");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Panel title="CONVERSATION ARCHIVE">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-astra-muted">
            Browse and resume chats saved in the local database. Deleting a conversation also deletes its messages from this PC.
          </p>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex items-center gap-2 rounded-lg border border-astra-cyan/40 px-3 py-2 text-xs text-astra-cyan hover:bg-cyan-950/40"
          >
            <MessageSquarePlus className="size-4" /> NEW CHAT
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-astra-cyan/25 bg-black/30 px-3">
          <Search className="size-4 shrink-0 text-astra-cyan" />
          <label className="sr-only" htmlFor="conversation-search">Search conversation titles</label>
          <input
            id="conversation-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversation titles..."
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-astra-muted"
          />
          <span className="shrink-0 font-mono text-[0.747rem] text-astra-muted">{filtered.length} / {conversations.length}</span>
        </div>

        {error ? <p className="mt-3 text-sm text-astra-danger" role="alert">{error}</p> : null}

        <ul className="mt-4 space-y-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${
                item.id === activeConversationId ? "border-astra-cyan/45 bg-cyan-950/15" : "border-white/10 bg-black/20"
              }`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-300/20 bg-sky-950/25 text-sky-200">
                <MessageSquare className="size-4" />
              </span>
              <button
                type="button"
                disabled={workingId === item.id}
                onClick={() => void open(item.id)}
                className="min-w-0 flex-1 text-left"
              >
                <strong className="block truncate text-sm text-white">{item.title}</strong>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-astra-muted">
                  <span className="inline-flex items-center gap-1"><Clock3 className="size-3" /> Updated {formatConversationDate(item.updated_at)}</span>
                  {item.id === activeConversationId ? <span className="font-mono text-[0.713rem] text-astra-cyan">CURRENT CHAT</span> : null}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${item.title}`}
                title="Delete conversation"
                disabled={workingId === item.id}
                onClick={() => void remove(item.id, item.title)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-astra-danger/20 text-astra-danger hover:border-astra-danger/60 hover:bg-astra-danger/10 disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/10 p-6 text-center">
              <p className="text-sm text-astra-muted">
                {conversations.length ? "No conversations match that title." : "No conversations have been saved yet."}
              </p>
              {!conversations.length ? (
                <NavLink to="/chat" onClick={startNewConversation} className="mt-3 inline-block text-sm text-astra-cyan hover:text-white">
                  Start a chat in AI Core
                </NavLink>
              ) : null}
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
