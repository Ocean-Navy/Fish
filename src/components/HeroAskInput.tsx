"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * The landing hero input is REAL (Venice-style "Ask anything"): type a question,
 * press Enter, and the meal counter runs it as a Quick Catch order.
 */
export function HeroAskInput() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = question.trim();
    router.push(q ? `/ask?q=${encodeURIComponent(q)}` : "/ask");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 flex min-h-16 max-w-2xl items-center justify-between gap-3 rounded-full border border-fish-accent/35 bg-white/95 px-3 pl-5 text-left shadow-harbor transition focus-within:scale-[1.01]"
    >
      <label htmlFor="fish-hero-ask" className="sr-only">
        Ask Fish anything
      </label>
      <input
        id="fish-hero-ask"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask Fish anything..."
        autoComplete="off"
        className="h-12 w-full bg-transparent text-base font-black text-fish-navy900 outline-none placeholder:text-fish-navy900/55 sm:text-xl"
      />
      <button
        type="submit"
        aria-label="Ask Fish"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua text-fish-navy950 transition hover:scale-105"
      >
        <Send className="h-5 w-5" aria-hidden="true" />
      </button>
    </form>
  );
}
