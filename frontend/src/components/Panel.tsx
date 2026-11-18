import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl p-4 ${className}`}>
      <h2 className="font-display text-[0.68rem] tracking-[0.22em] text-astra-cyan">{title}</h2>
      <div className="panel-content mt-3">{children}</div>
    </section>
  );
}
