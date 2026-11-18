import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types/index.ts";
import { ConversationPanel } from "./ConversationPanel.tsx";

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  content: "Hello",
  created_at: "2026-01-01T00:00:00Z",
};

describe("ConversationPanel", () => {
  it("shows a thinking message before the stream metadata arrives", () => {
    const markup = renderToStaticMarkup(createElement(ConversationPanel, { messages: [], isThinking: true }));

    expect(markup).toContain('aria-label="ASTRA is thinking"');
    expect(markup).toContain("Thinking");
    expect(markup).not.toContain("No messages in this conversation yet.");
  });

  it("shows thinking in the pending assistant bubble, then replaces it with streamed text", () => {
    const pendingMessage: ChatMessage = {
      id: "stream-1",
      role: "assistant",
      content: "",
      created_at: "2026-01-01T00:00:01Z",
    };
    const pendingMarkup = renderToStaticMarkup(
      createElement(ConversationPanel, { messages: [userMessage, pendingMessage], isThinking: true }),
    );
    const responseMarkup = renderToStaticMarkup(
      createElement(ConversationPanel, {
        messages: [userMessage, { ...pendingMessage, content: "Hello there." }],
        isThinking: false,
      }),
    );

    expect(pendingMarkup.match(/aria-label="ASTRA is thinking"/g)).toHaveLength(1);
    expect(responseMarkup).toContain("Hello there.");
    expect(responseMarkup).not.toContain("ASTRA is thinking");
  });
});
