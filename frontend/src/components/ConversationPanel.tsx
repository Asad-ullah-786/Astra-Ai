import type { ChatMessage } from "../types/index.ts";

function ThinkingIndicator() {
  return (
    <p className="chat-thinking-indicator mt-1" role="status" aria-label="ASTRA is thinking">
      Thinking
      <span className="chat-thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}

function ThinkingMessage() {
  return (
    <article className="chat-thinking-message rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="font-display text-[0.62rem] tracking-[0.18em] text-astra-cyan">ASTRA</p>
      <ThinkingIndicator />
    </article>
  );
}

export function ConversationPanel({
  messages,
  isThinking = false,
  className = "h-80",
}: {
  messages: ChatMessage[];
  isThinking?: boolean;
  className?: string;
}) {
  const hasPendingAssistant = messages.some(
    (message) => message.id.startsWith("stream-") && message.role === "assistant" && !message.content,
  );

  return (
    <div className={`flex flex-col gap-3 overflow-y-auto pr-1 ${className}`} aria-live="polite">
      {messages.length === 0 && !isThinking ? (
        <p className="text-sm text-astra-muted">No messages in this conversation yet.</p>
      ) : null}
      {messages.map((message) => {
        const isPendingAssistant =
          isThinking && message.id.startsWith("stream-") && message.role === "assistant" && !message.content;
        if (isPendingAssistant) {
          return <ThinkingMessage key={message.id} />;
        }

        return (
          <article key={message.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="font-display text-[0.62rem] tracking-[0.18em] text-astra-cyan">
              {message.role === "user" ? "YOU" : "ASTRA"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
          </article>
        );
      })}
      {isThinking && !hasPendingAssistant ? <ThinkingMessage /> : null}
    </div>
  );
}
