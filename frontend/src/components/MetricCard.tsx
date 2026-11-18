export function MetricCard({
  label,
  value,
  hint,
  percent,
}: {
  label: string;
  value: string;
  hint: string;
  percent: number | null;
}) {
  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-[0.68rem] tracking-[0.22em] text-astra-cyan">{label}</h2>
        <p className="font-mono text-xl text-white">{value}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        {percent !== null ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-astra-blue to-astra-cyan"
            style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
          />
        ) : null}
      </div>
      <p className="mt-2 text-sm text-astra-muted">{hint}</p>
    </section>
  );
}
