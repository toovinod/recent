"use client";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@recent/auth/password-policy";
import { type FormEvent, useState } from "react";
import {
  fieldClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textButtonClass,
} from "../../components/form-styles";
import { GoogleIcon, XIcon } from "../../components/social-icons";
import { authClient } from "../../lib/auth-client";

type Mode = "sign-in" | "forgot" | "reset";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submitAuthForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
        window.location.assign("/news");
      } else if (mode === "forgot") {
        const { error } = await authClient.emailOtp.requestPasswordReset({ email });
        if (error) throw new Error(error.message);
        setMode("reset");
        setMessage("If an account exists, a reset code has been sent.");
      } else {
        const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
        if (error) throw new Error(error.message);
        setOtp("");
        setPassword("");
        setMode("sign-in");
        setMessage("Password updated. Sign in with your new password.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function signInWithProvider(provider: "google" | "twitter") {
    setPending(true);
    setMessage("");
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL: "/news" });
      if (error) setMessage(error.message ?? "Could not start sign-in.");
    } catch {
      setMessage("Could not start sign-in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const formTitle = {
    "sign-in": "Sign in",
    forgot: "Reset your password",
    reset: "Enter your reset code",
  }[mode];

  return (
    <section className="w-full rounded-[4px] border border-ink/10 bg-white p-6 shadow-[0_24px_70px_rgba(32,30,48,0.08)] sm:aspect-square sm:flex sm:flex-col sm:justify-center sm:p-7">
      <h2 className="text-center text-[27px] leading-tight font-semibold tracking-[-.05em]">
        {formTitle}
      </h2>
      <form onSubmit={submitAuthForm} className="mt-6 grid gap-4">
        <label className={fieldClass}>
          Email
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {(mode === "sign-in" || mode === "reset") && (
          <label className={fieldClass}>
            Password
            <input
              className={inputClass}
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={mode === "sign-in" ? undefined : MIN_PASSWORD_LENGTH}
              maxLength={mode === "sign-in" ? undefined : MAX_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        )}
        {mode === "reset" && (
          <label className={fieldClass}>
            Code
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
            />
          </label>
        )}
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-1`}>
          {pending ? "Please wait..." : formTitle}
        </button>
      </form>
      {mode === "sign-in" && (
        <div className="mt-5 grid gap-3 border-t border-ink/10 pt-5">
          <button
            type="button"
            disabled={pending}
            onClick={() => signInWithProvider("google")}
            className={`${secondaryButtonClass} relative`}
          >
            <span className="absolute left-4">
              <GoogleIcon />
            </span>
            Continue with Google
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => signInWithProvider("twitter")}
            className={`${secondaryButtonClass} relative`}
          >
            <span className="absolute left-4">
              <XIcon />
            </span>
            Continue with X
          </button>
        </div>
      )}
      <nav
        className="mt-5 flex flex-wrap items-center justify-center gap-4 border-t border-ink/10 pt-5"
        aria-label="Account options"
      >
        {mode !== "sign-in" && (
          <button type="button" onClick={() => setMode("sign-in")} className={textButtonClass}>
            Sign in
          </button>
        )}
        {mode === "sign-in" && (
          <button type="button" onClick={() => setMode("forgot")} className={textButtonClass}>
            Forgot password?
          </button>
        )}
      </nav>
      {message && (
        <p
          role="status"
          className="mt-5 rounded-lg bg-[#f1efff] px-4 py-3 text-[13px] leading-5 text-ink"
        >
          {message}
        </p>
      )}
    </section>
  );
}
