import { useAstra } from "../hooks/useAstra.ts";

export function ModuleNotice({ moduleId }: { moduleId: string }) {
  const { modules, online } = useAstra();
  const module = modules.find((item) => item.id === moduleId);
  const loading = online && modules.length === 0;
  const missing = online && modules.length > 0 && !module;

  return (
    <section className="glass rounded-2xl p-5">
      <p className="font-display text-[0.68rem] tracking-[0.22em] text-astra-cyan">
        {module ? `PHASE ${module.phase}` : "MODULE"}
      </p>
      <h2 className="mt-2 font-display text-lg tracking-[0.12em] text-white">
        {module?.name ?? (loading ? "Checking…" : missing ? "Unavailable" : "Backend offline")}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-astra-muted">
        {module?.summary ??
          (loading
            ? "Checking the local backend for registered modules."
            : missing
              ? "This module is not registered on the local backend."
              : "Start the local ASTRA backend to check module availability.")}
      </p>
      <p className="mt-4 font-mono text-xs tracking-[0.18em] text-astra-cyan">
        STATUS {module?.status.toUpperCase() ?? (loading ? "CHECKING" : missing ? "UNKNOWN" : "OFFLINE")}
      </p>
    </section>
  );
}
