"use client";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@recent/auth/password-policy";
import { type FormEvent, useState } from "react";
import { authClient } from "../../lib/auth-client";

type Mode = "sign-in" | "sign-up" | "verify" | "forgot" | "reset";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) throw new Error(error.message);
        setPassword("");
        setMode("verify");
        setMessage("Check your email for a verification code.");
      } else if (mode === "verify") {
        const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
        if (error) throw new Error(error.message);
        setOtp("");
        setMode("sign-in");
        setMessage("Email verified. You can now sign in.");
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

  async function resendVerificationCode() {
    setPending(true);
    setMessage("");
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      setMessage(
        error ? (error.message ?? "Could not send a new code.") : "A new code has been sent.",
      );
    } catch {
      setMessage("Could not send a new code. Please try again.");
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
    "sign-up": "Create an account",
    verify: "Verify your email",
    forgot: "Reset your password",
    reset: "Enter your reset code",
  }[mode];

  return (
    <section className="auth-card">
      <h2>{formTitle}</h2>
      <form onSubmit={submitAuthForm}>
        {mode === "sign-up" && (
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
          <label>
            Password
            <input
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
        {(mode === "verify" || mode === "reset") && (
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
            />
          </label>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Please wait..." : formTitle}
        </button>
      </form>
      {mode === "sign-in" && (
        <div className="auth-social">
          <button type="button" disabled={pending} onClick={() => signInWithProvider("google")}>
            Continue with Google
          </button>
          <button type="button" disabled={pending} onClick={() => signInWithProvider("twitter")}>
            Continue with X
          </button>
        </div>
      )}
      {mode === "verify" && (
        <button type="button" disabled={pending} onClick={resendVerificationCode}>
          Send another code
        </button>
      )}
      <nav className="auth-links" aria-label="Account options">
        {mode !== "sign-in" && (
          <button type="button" onClick={() => setMode("sign-in")}>
            Sign in
          </button>
        )}
        {mode !== "sign-up" && (
          <button type="button" onClick={() => setMode("sign-up")}>
            Create account
          </button>
        )}
        {mode === "sign-in" && (
          <button type="button" onClick={() => setMode("forgot")}>
            Forgot password?
          </button>
        )}
      </nav>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
