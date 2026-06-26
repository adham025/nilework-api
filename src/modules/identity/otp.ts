import { env } from "@/core/env";

/** True when no real CPaaS is wired — OTP codes are logged, not sent. */
export const isOtpDevMode = !(env.OTP_PROVIDER === "cequens" && env.CEQUENS_API_KEY);

/**
 * Send an OTP via the configured CPaaS (WhatsApp-first, SMS fallback — §6). In dev
 * mode the code is printed to the server log so the flow is testable without a
 * registered sender. Best-effort: a send failure is logged, not thrown (the code is
 * still stored, and dev mode returns it to the client).
 */
export async function sendOtp(phone: string, code: string): Promise<void> {
  if (isOtpDevMode) {
    console.log(`[otp:log] phone=${phone} code=${code}`);
    return;
  }
  try {
    await fetch("https://apis.cequens.com/messaging/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CEQUENS_API_KEY}`,
      },
      body: JSON.stringify({
        senderName: env.CEQUENS_SENDER,
        messageType: "text",
        recipients: phone,
        messageText: `Nilework verification code: ${code}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("sendOtp failed:", err);
  }
}
