import { useState } from "react";
import { Mic } from "lucide-react";
import { NavLink } from "react-router";
import type { ChatMessage, CommandSendOptions } from "../types/index.ts";

export function CommandBar({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string, options?: CommandSendOptions) => Promise<ChatMessage | null>;
}) {
  const [text, setText] = useState("");

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = text;
        if (!next.trim()) return;
        setText("");
        void onSubmit(next);
      }}
    >
      <label className="sr-only" htmlFor="astra-command">
        Text command
      </label>
      <input
        id="astra-command"
        value={text}
        maxLength={4000}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        placeholder="Tell ASTRA what you need"
        className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-astra-muted focus:border-astra-cyan"
      />
      <button
        type="submit"
        disabled={disabled || text.trim().length === 0}
        className="rounded-xl bg-astra-blue px-4 py-3 font-display text-xs tracking-[0.18em] text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        SEND
      </button>
      <NavLink
        to="/voice"
        className={`astra-voice-input-button ${disabled ? "is-unavailable" : ""}`}
        aria-label="Open ASTRA voice assistant"
        aria-disabled={disabled}
        title="Open ASTRA voice assistant"
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <Mic className="size-4" />
      </NavLink>
    </form>
  );
}
