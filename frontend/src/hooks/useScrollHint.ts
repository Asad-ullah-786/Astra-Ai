import { useEffect, useRef, useState } from "react";

export function useScrollHint() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const canScroll = element.scrollHeight > element.clientHeight + 1;
      const scrolled = canScroll && element.scrollTop > 1;
      setIsScrollable((current) => current === canScroll ? current : canScroll);
      setHasScrolled((current) => current === scrolled ? current : scrolled);
    };

    const resizeObserver = new ResizeObserver(update);
    const observeContent = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(element);
      for (const child of element.children) {
        resizeObserver.observe(child);
      }
      update();
    };
    const mutationObserver = new MutationObserver(observeContent);

    element.addEventListener("scroll", update, { passive: true });
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    observeContent();

    return () => {
      element.removeEventListener("scroll", update);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return { scrollRef, isScrollable, hasScrolled };
}
