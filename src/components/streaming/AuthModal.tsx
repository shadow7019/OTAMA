"use client";

import { useState } from "react";
import { Loader2, Clapperboard } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AuthModal() {
  const open = useStore((s) => s.authOpen);
  const setOpen = useStore((s) => s.setAuthOpen);
  const signIn = useStore((s) => s.signIn);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    await signIn(trimmed);
    setBusy(false);
    setName("");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={() => !busy && setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && !busy && setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <form
        onSubmit={(e) => void submit(e)}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-sm rounded-2xl border border-white/10 bg-popover p-6 shadow-2xl shadow-black/60 transition-transform duration-200",
          open ? "scale-100" : "scale-95"
        )}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">Sign in to Cineora</h2>
            <p className="text-xs text-muted-foreground">
              Keep your list synced on this device
            </p>
          </div>
        </div>

        <label
          htmlFor="auth-name"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Display name
        </label>
        <input
          id="auth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. MovieNighter"
          maxLength={24}
          autoFocus={open}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Demo sign-in: only your display name is stored in a first-party cookie. Your watchlist
          and viewing progress always stay in your browser&apos;s local storage.
        </p>

        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-2 h-10 w-full rounded-xl text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Maybe later
        </button>
      </form>
    </div>
  );
}
