import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Panel } from "../components/Panel.tsx";
import { searchResearch } from "../services/api.ts";
import type { ResearchResponse } from "../types/index.ts";

export function ResearchPage() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      setResponse(await searchResearch(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Web search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Panel title="FREE WEB RESEARCH">
        <p className="mb-3 text-sm text-astra-muted">
          Search the public web with DuckDuckGo at no charge. Your query is sent to the search provider; results link to their original sources.
        </p>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => void search(event)}>
          <label className="sr-only" htmlFor="research-query">Web search query</label>
          <input
            id="research-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={300}
            minLength={2}
            required
            placeholder="Search public web pages..."
            className="min-w-[14rem] flex-1 rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
          />
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center gap-2 rounded-lg border border-astra-cyan/40 px-4 py-2 text-sm text-astra-cyan disabled:opacity-50"
          >
            <Search className="size-4" /> {searching ? "SEARCHING..." : "SEARCH"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-astra-danger" role="alert">{error}</p> : null}
        {response ? (
          <>
            <p className="mt-4 text-xs text-astra-muted" role="status">
              {response.results.length} sources for “{response.query}”
            </p>
            <ol className="mt-2 space-y-2">
              {response.results.map((result) => (
                <li key={result.url} className="rounded-xl border border-astra-cyan/15 bg-black/20 p-3">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-astra-cyan hover:text-white"
                  >
                    {result.title}
                  </a>
                  {result.snippet ? <p className="mt-1 text-sm text-astra-muted">{result.snippet}</p> : null}
                  <p className="mt-1 break-all font-mono text-[0.65rem] text-astra-muted">{result.url}</p>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
