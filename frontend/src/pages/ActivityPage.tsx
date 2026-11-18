import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";

export function ActivityPage() {
  const { activities } = useAstra();

  return (
    <div className="mx-auto max-w-4xl">
      <Panel title="ACTIVITY HISTORY">
        <ul className="space-y-3">
          {activities.map((item) => (
            <li key={item.id} className="border-b border-white/10 pb-3">
              <p className="font-mono text-xs text-astra-cyan">
                {new Date(item.created_at).toLocaleString()} · {item.level.toUpperCase()} · {item.source}
              </p>
              <p className="mt-1 text-sm">{item.message}</p>
              {item.details ? <p className="mt-1 break-all font-mono text-xs text-astra-muted">{item.details}</p> : null}
            </li>
          ))}
          {activities.length === 0 ? <li className="text-sm text-astra-muted">No activity recorded yet.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}
