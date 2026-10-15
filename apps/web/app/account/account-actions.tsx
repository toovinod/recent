"use client";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@recent/auth/password-policy";
import { type FormEvent, useState } from "react";
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
    <div className="account-actions">
      <section className="auth-card">
        <h2>Change password</h2>
        <form onSubmit={submitPasswordChange}>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Update password
          </button>
        </form>
      </section>
      <button type="button" disabled={isSubmitting} onClick={signOut}>
        Sign out
      </button>
      {statusMessage && <p role="status">{statusMessage}</p>}
    </div>
  );
}
