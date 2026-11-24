import { ChevronsDown, ChevronsUp } from "lucide-react";
import type { RefObject } from "react";

export function ScrollHintArrow({
  hasScrolled,
  scrollRef,
}: {
  hasScrolled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const Icon = hasScrolled ? ChevronsUp : ChevronsDown;

  return (
    <button
      type="button"
      className={`scroll-hint-indicator ${hasScrolled ? "is-up" : "is-down"}`}
      aria-label={hasScrolled ? "Scroll up" : "Scroll down"}
      onClick={() => {
        const element = scrollRef.current;
        if (element) {
          element.scrollBy({
            top: (hasScrolled ? -1 : 1) * element.clientHeight * 0.8,
            behavior: "smooth",
          });
        }
      }}
    >
      <Icon className="size-4" />
    </button>
  );
}
