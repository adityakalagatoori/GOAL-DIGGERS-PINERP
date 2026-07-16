import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS on port 587
  auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD },
  tls: { rejectUnauthorized: false },
  // Without these, an unreachable/misconfigured SMTP server makes sendMail
  // hang indefinitely instead of failing — the request (and the "forgot
  // password" button) would just spin forever with no feedback.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
});

/**
 * Password reset must not silently fail the whole request just because SMTP
 * isn't configured or Gmail rejects the connection — requestPasswordReset()
 * already responds identically regardless of whether the account exists
 * (anti-enumeration), so a mail delivery failure here shouldn't surface as a
 * generic 500 either. Logged server-side for diagnosis instead.
 */
export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  try {
    await transporter.sendMail({
      from: env.SMTP_USER,
      to,
      subject: "Reset your PINERP password",
      html: `
        <p>We received a request to reset your PINERP password.</p>
        <p><a href="${resetUrl}">Click here to choose a new password</a></p>
        <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
      `,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send password reset email:", err instanceof Error ? err.message : err);
  }
}
