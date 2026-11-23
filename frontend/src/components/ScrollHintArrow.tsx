import { ChevronDown, ChevronUp } from "lucide-react";

export function ScrollHintArrow({ hasScrolled }: { hasScrolled: boolean }) {
  const Icon = hasScrolled ? ChevronUp : ChevronDown;

  return (
    <span
      className={`scroll-hint-indicator ${hasScrolled ? "is-up" : "is-down"}`}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}
