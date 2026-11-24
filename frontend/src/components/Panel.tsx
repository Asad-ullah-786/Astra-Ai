import type { ReactNode } from "react";
import { ScrollHintArrow } from "./ScrollHintArrow.tsx";
import { useScrollHint } from "../hooks/useScrollHint.ts";

export function Panel({
  title,
  children,
  className = "",
  id,
  scrollHint = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  id?: string;
  scrollHint?: boolean;
}) {
  const { scrollRef, isScrollable, hasScrolled } = useScrollHint();

  return (
    <section id={id} className={`glass rounded-2xl p-4 ${className}`}>
      <h2 className="font-display text-[0.782rem] tracking-[0.22em] text-astra-cyan">{title}</h2>
      {scrollHint ? (
        <div className={`scroll-hint-frame panel-scroll-hint-frame mt-3 ${isScrollable ? "has-scroll-hint" : ""}`}>
          <div className="panel-content" ref={scrollRef}>{children}</div>
          {isScrollable ? <ScrollHintArrow hasScrolled={hasScrolled} scrollRef={scrollRef} /> : null}
        </div>
      ) : (
        <div className="panel-content mt-3">{children}</div>
      )}
    </section>
  );
}
