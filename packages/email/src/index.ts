import { createHmac } from "node:crypto";
import { Resend } from "resend";

export type OtpPurpose = "sign-in" | "email-verification" | "forget-password" | "change-email";

const purposeText: Record<OtpPurpose, string> = {
  "sign-in": "sign in to Recent",
  "email-verification": "verify your Recent email address",
  "forget-password": "reset your Recent password",
  "change-email": "change your Recent email address",
};

export interface MailerConfig {
  apiKey: string;
  from: string;
  idempotencySecret: string;
}

export function createMailer({ apiKey, from, idempotencySecret }: MailerConfig) {
  if (!apiKey || !from || !idempotencySecret) {
    throw new Error("Resend mailer configuration is incomplete");
  }

  const resend = new Resend(apiKey);

  return {
    async sendOtp(to: string, otp: string, purpose: OtpPurpose) {
      const idempotencyKey = createHmac("sha256", idempotencySecret)
        .update(`${purpose}\0${to.toLowerCase()}\0${otp}`)
        .digest("hex");
      const { error } = await resend.emails.send(
        {
          from,
          to,
          subject: `Your Recent code to ${purposeText[purpose]}`,
          text: `Your code to ${purposeText[purpose]} is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
        },
        { idempotencyKey },
      );
      if (error) throw new Error(`Unable to deliver authentication email: ${error.name}`);
    },
  };
}
