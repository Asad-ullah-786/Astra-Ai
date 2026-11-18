import { useState, type FormEvent } from "react";
import { NavLink } from "react-router";
import { useAstra } from "../hooks/useAstra.ts";
import { Panel } from "../components/Panel.tsx";

export function MemoryPage() {
  const {
    aiStatus,
    memories,
    createMemory,
    updateMemory,
    deleteMemory,
  } = useAstra();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await updateMemory(editingId, { title, content });
      } else {
        await createMemory({ title, content });
      }
      setTitle("");
      setContent("");
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Memory could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Panel title="PERSONAL MEMORY · STORED ON THIS PC">
        <p className="mb-3 text-sm text-astra-muted">
          Add only notes you choose to save. Notes may be included in relevant chats with your selected model
          {aiStatus?.selected_model?.startsWith("gemini:")
            ? " and sent to Google Gemini"
            : aiStatus?.selected_model?.startsWith("openai:")
              ? " and sent to OpenAI"
              : " on this computer"}.
          Do not save passwords, API keys, or other secrets.
        </p>
        <form className="grid gap-3" onSubmit={(event) => void saveMemory(event)}>
          <label className="grid gap-1 text-xs text-astra-muted">
            Memory title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
              placeholder="For example: Preferred language"
            />
          </label>
          <label className="grid gap-1 text-xs text-astra-muted">
            Note
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={2000}
              required
              rows={3}
              className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
              placeholder="What should ASTRA remember?"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-astra-cyan/40 px-4 py-2 text-sm text-astra-cyan disabled:opacity-50"
            >
              {saving ? "SAVING..." : editingId ? "UPDATE MEMORY" : "SAVE MEMORY"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTitle("");
                  setContent("");
                }}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-astra-muted"
              >
                CANCEL
              </button>
            ) : null}
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-astra-danger" role="alert">{error}</p> : null}
        <ul className="mt-4 space-y-2">
          {memories.map((memory) => (
            <li key={memory.id} className="rounded-xl border border-astra-cyan/15 bg-black/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="text-sm text-white">{memory.title}</strong>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-astra-muted">{memory.content}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    className="text-astra-cyan"
                    onClick={() => {
                      setEditingId(memory.id);
                      setTitle(memory.title);
                      setContent(memory.content);
                      setError("");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-astra-danger"
                    onClick={() => {
                      void deleteMemory(memory.id).catch((caught: unknown) =>
                        setError(caught instanceof Error ? caught.message : "Memory could not be deleted."),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {memories.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-astra-muted">
              No saved personal memories yet.
            </li>
          ) : null}
        </ul>
      </Panel>

      <div className="flex flex-wrap gap-3 text-sm">
        <NavLink to="/knowledge" className="text-astra-cyan hover:text-white">Search saved knowledge</NavLink>
        <NavLink to="/conversations" className="text-astra-cyan hover:text-white">Open conversation archive</NavLink>
      </div>
    </div>
  );
}
