"use client";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@recent/auth/password-policy";
import { type FormEvent, useState } from "react";
import {
  fieldClass,
  inputClass,
  primaryButtonClass,
  textButtonClass,
} from "../../components/form-styles";
import { authClient } from "../../lib/auth-client";

export function AccountActions() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage("");
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      setStatusMessage(
        error ? (error.message ?? "Could not update password.") : "Password updated.",
      );
      if (!error) {
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch {
      setStatusMessage("Could not update password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    setIsSubmitting(true);
    setStatusMessage("");
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setStatusMessage(error.message ?? "Could not sign out.");
      } else {
        window.location.assign("/auth");
      }
    } catch {
      setStatusMessage("Could not sign out. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <section className="rounded-xl border border-ink/10 bg-white p-6 shadow-[0_24px_70px_rgba(32,30,48,0.08)] sm:p-9">
        <h2 className="text-[29px] leading-tight font-semibold tracking-[-.05em]">
          Change password
        </h2>
        <form onSubmit={submitPasswordChange} className="mt-8 grid gap-5">
          <label className={fieldClass}>
            Current password
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className={fieldClass}>
            New password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting} className={`${primaryButtonClass} mt-1`}>
            Update password
          </button>
        </form>
      </section>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={signOut}
        className={`${textButtonClass} mt-7`}
      >
        Sign out
      </button>
      {statusMessage && (
        <p role="status" className="mt-5 rounded-lg bg-[#e8e6fa] px-4 py-3 text-[13px] leading-5">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
