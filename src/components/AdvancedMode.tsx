"use client";

import { Settings2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Simple-by-default UI mode (docs/ux-simplification-plan.md).
 * Simple mode keeps the Venice-style minimal surface; Advanced mode shows
 * operator/protocol detail. Persisted like the meal-counter dish choice.
 */

const STORAGE_KEY = "fish-ui-mode-v1";
const MODE_EVENT = "fish-ui-mode-change";

function readAdvancedMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "advanced";
  } catch {
    return false;
  }
}

export function useAdvancedMode(): [boolean, (advanced: boolean) => void] {
  const [advanced, setAdvancedState] = useState(false);

  useEffect(() => {
    const sync = () => setAdvancedState(readAdvancedMode());
    sync();
    window.addEventListener(MODE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MODE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setAdvanced = (next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "advanced" : "simple");
    } catch {
      // Storage can be unavailable; the toggle still works for this view.
    }
    setAdvancedState(next);
    window.dispatchEvent(new CustomEvent(MODE_EVENT));
  };

  return [advanced, setAdvanced];
}

export function AdvancedModeToggle({ className = "" }: { className?: string }) {
  const [advanced, setAdvanced] = useAdvancedMode();
  return (
    <button
      type="button"
      onClick={() => setAdvanced(!advanced)}
      aria-pressed={advanced}
      title={advanced ? "Showing every control. Switch back to the simple counter." : "Show model choice, API keys, contract controls, and full detail."}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-black transition ${
        advanced ? "border-fish-gold/45 bg-fish-gold/15 text-fish-gold" : "border-fish-accent/25 bg-fish-navy950/60 text-fish-secondary hover:border-fish-accent/50 hover:text-white"
      } ${className}`}
    >
      <Settings2 className="h-4 w-4" aria-hidden="true" />
      {advanced ? "Advanced mode: on" : "Advanced mode"}
    </button>
  );
}

/** Renders children only in Advanced mode. */
export function AdvancedOnly({ children }: { children: ReactNode }) {
  const [advanced] = useAdvancedMode();
  if (!advanced) {
    return null;
  }
  return <>{children}</>;
}
