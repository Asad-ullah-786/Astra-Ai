import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollHintArrow } from "./ScrollHintArrow.tsx";

describe("ScrollHintArrow", () => {
  it("renders a background-free, accessible double chevron for each scroll direction", () => {
    const scrollRef = createRef<HTMLDivElement>();
    const down = renderToStaticMarkup(createElement(ScrollHintArrow, { hasScrolled: false, scrollRef }));
    const up = renderToStaticMarkup(createElement(ScrollHintArrow, { hasScrolled: true, scrollRef }));

    expect(down).toContain('aria-label="Scroll down"');
    expect(down).toContain("scroll-hint-indicator is-down");
    expect(down.match(/<path/g)).toHaveLength(2);
    expect(up).toContain('aria-label="Scroll up"');
    expect(up).toContain("scroll-hint-indicator is-up");
    expect(up.match(/<path/g)).toHaveLength(2);
  });
});
