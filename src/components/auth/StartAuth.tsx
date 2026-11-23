"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, KeyRound, Mail } from "lucide-react";
import { createClient } from "@/server/auth/client";

type Mode = "register" | "signin";
type State = "idle" | "busy" | "sent" | "error" | "exists" | "badCredentials" | "weakPassword";

/**
 * The vendor door: register a restaurant, or sign back in.
 *
 * Registration and sign-in live in one card because they are one decision. Once
 * either succeeds the visitor goes to onboarding, which is where a new vendor
 * names the restaurant and a returning one is forwarded straight to operations -
 * so nobody is ever asked to onboard twice.
 */
export function StartAuth({ configured, localMode }: { configured: boolean; localMode: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");

  function message(): string | null {
    switch (state) {
      case "sent":
        return "Check your email: we sent a link that finishes the sign-in.";
      case "exists":
        return "That email already has an account. Use Sign in instead.";
      case "badCredentials":
        return "That email and password do not match an account.";
      case "weakPassword":
        return "Use at least 8 characters.";
      case "error":
        return "Something went wrong. Try again in a moment.";
      default:
        return null;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured && !localMode) {
      setState("error");
      return;
    }
    setState("busy");

    if (localMode) {
      const response = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode }),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      router.push(`/${locale}/onboarding`);
      router.refresh();
      return;
    }

    const supabase = createClient();

    if (mode === "register") {
      if (password.length < 8) {
        setState("weakPassword");
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback/${locale}/onboarding` },
      });
      if (error) {
        setState(error.message.toLowerCase().includes("registered") ? "exists" : "error");
        return;
      }
      // While the project auto-confirms, signUp returns a session: go straight on.
      if (data.session) {
        router.push(`/${locale}/onboarding`);
        router.refresh();
        return;
      }
      setState("sent");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState(error.status === 400 || error.code === "invalid_credentials" ? "badCredentials" : "error");
      return;
    }
    router.push(`/${locale}/onboarding`);
    router.refresh();
  }

  const notice = message();

  return (
    <div className="start-panel" id="join">
      <div className="start-tabs" role="tablist" aria-label="Register or sign in">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "is-active" : ""}
          onClick={() => { setMode("register"); setState("idle"); }}
        >
          Open your restaurant
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "is-active" : ""}
          onClick={() => { setMode("signin"); setState("idle"); }}
        >
          Sign in
        </button>
      </div>

      <form onSubmit={submit} className="start-form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@restaurant.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
          />
        </label>

        <button type="submit" className="button button--block" disabled={state === "busy"}>
          {state === "busy" ? "Working…" : mode === "register" ? "Create my restaurant" : "Sign in"}
        </button>

        <p className="start-fineprint">
          {mode === "register"
            ? "Two minutes to a page of your own. No card needed to start."
            : "Signing in takes you to your dashboard, or back to where you stopped."}
        </p>
      </form>

      {notice && (
        <p className={`start-notice${state === "sent" ? " is-good" : " is-bad"}`}>
          {state === "sent" ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
          {notice}
        </p>
      )}

      <div className="start-alt">
        <span><KeyRound size={14} aria-hidden="true" /> Prefer no password?</span>
        <a href={`/${locale}/login`}>Email me a sign-in link <Mail size={14} aria-hidden="true" /></a>
      </div>
    </div>
  );
}
