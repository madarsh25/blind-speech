import { Resend } from "resend";
import nodemailer from "nodemailer";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Anonymous Workplace <onboarding@resend.dev>";

// SMTP Config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const DEBUG_EMAIL_CONSOLE = process.env.DEBUG_EMAIL_CONSOLE === "true";

let resendInstance: Resend | null = null;
if (RESEND_API_KEY && RESEND_API_KEY !== "re_placeholder") {
  resendInstance = new Resend(RESEND_API_KEY);
}

let smtpTransporter: nodemailer.Transporter | null = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email using Resend, SMTP, or Console Logging (if explicitly enabled).
 */
export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<{ success: boolean; id?: string }> {
  // If console debug mode is explicitly turned on
  if (DEBUG_EMAIL_CONSOLE) {
    const [user, domain] = to.split("@");
    const masked = `${user.slice(0, 2)}***@${domain}`;
    console.log("=========================================" );
    console.log(`[DEBUG MAIL] To: ${masked}`);
    console.log(`[DEBUG MAIL] Subject: ${subject}`);
    console.log("=========================================" );
    return { success: true, id: "debug-console-id" };
  }

  // 1. Primary: Resend
  if (resendInstance) {
    try {
      const data = await resendInstance.emails.send({
        from: EMAIL_FROM,
        to: [to],
        subject: subject,
        html: html,
        text: text,
      });

      if (data.error) {
        console.error("Resend delivery error: [REDACTED]", { code: data.error?.name });
        throw new Error("Resend API Error");
      }

      return { success: true, id: data.data?.id };
    } catch (error: any) {
      console.error("Failed to send email via Resend primary provider: [REDACTED]", { name: error?.name, code: error?.code });
      // Fall through to SMTP if configured
      if (!smtpTransporter) throw error;
    }
  }

  // 2. Secondary/Fallback: SMTP
  if (smtpTransporter) {
    try {
      const info = await smtpTransporter.sendMail({
        from: EMAIL_FROM,
        to: to,
        subject: subject,
        html: html,
        text: text,
      });

      return { success: true, id: info.messageId };
    } catch (error: any) {
      console.error("Failed to send email via fallback SMTP provider: [REDACTED]", { name: error?.name, code: error?.code });
      throw error;
    }
  }

  // 3. Fail if nothing is configured
  throw new Error("No mail provider is configured. Please provide RESEND_API_KEY or SMTP parameters, or enable DEBUG_EMAIL_CONSOLE=true for local debug logs.");
}

/**
 * Sends the OTP magic link code email.
 */
export async function sendOtpEmail(to: string, code: string): Promise<{ success: boolean }> {
  const subject = `${code} is your magic verification code`;
  
  const html = `
    <div style="background-color: #faf9f5; padding: 48px 24px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #141413; text-align: center;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e6dfd8; border-radius: 12px; padding: 40px; box-shadow: 0 4px 12px rgba(20,20,19,0.03);">
        <h2 style="font-family: 'Georgia', serif; font-size: 28px; font-weight: normal; margin-top: 0; color: #141413;">Verify your email</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #3d3d3a; margin-bottom: 32px;">
          Here is your magic verification code to access your anonymous workplace posting account. This code is valid for 10 minutes.
        </p>
        <div style="background-color: #f5f0e8; border-radius: 8px; padding: 24px; margin-bottom: 32px; letter-spacing: 4px; font-family: 'JetBrains Mono', monospace; font-size: 36px; font-weight: bold; color: #cc785c;">
          ${code}
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #8e8b82; margin: 0;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const text = `Verify your email:
  
Here is your magic verification code to access your anonymous workplace posting account:

${code}

This code is valid for 10 minutes.
If you didn't request this code, you can safely ignore this email.`;

  const result = await sendEmail({ to, subject, html, text });
  return { success: result.success };
}
