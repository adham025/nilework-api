import { getDb } from "@/core/db";
import { env } from "@/core/env";
import { supabaseAdmin } from "@/core/supabase";

/** Email is sent only when Resend is configured; otherwise in-app-only. */
export const isEmailConfigured = Boolean(env.RESEND_API_KEY);

type Locale = "en" | "ar";
interface Copy {
  subject: string;
  line: string;
}

/**
 * Email copy per notification type, bilingual. Only money/deadline-related types
 * are here (§6.11); any other type returns nothing and is in-app-only.
 */
const EMAIL_COPY: Record<string, Record<Locale, Copy>> = {
  order_funded: {
    en: {
      subject: "Your order was funded",
      line: "Payment is in escrow — time to start the work.",
    },
    ar: { subject: "تم تمويل طلبك", line: "الدفعة في الضمان — حان وقت بدء العمل." },
  },
  order_delivered: {
    en: { subject: "Your order was delivered", line: "Review the delivery and release payment." },
    ar: { subject: "تم تسليم طلبك", line: "راجع التسليم وحرّر الدفعة." },
  },
  order_released: {
    en: { subject: "Payment released", line: "Funds were released to your wallet." },
    ar: { subject: "تم تحرير الدفعة", line: "تم تحرير الأموال إلى محفظتك." },
  },
  payout_paid: {
    en: { subject: "Your withdrawal was sent", line: "Your payout has been disbursed." },
    ar: { subject: "تم إرسال السحب", line: "تم صرف مبلغ السحب الخاص بك." },
  },
  identity_approved: {
    en: { subject: "Identity verified", line: "Your identity has been verified." },
    ar: { subject: "تم توثيق الهوية", line: "تم توثيق هويتك بنجاح." },
  },
  identity_rejected: {
    en: {
      subject: "Identity verification update",
      line: "Your submission needs another look — please resubmit.",
    },
    ar: { subject: "تحديث توثيق الهوية", line: "طلبك يحتاج مراجعة — يُرجى إعادة الإرسال." },
  },
  dispute_opened: {
    en: {
      subject: "A dispute was opened",
      line: "A dispute was opened on your order. Our team will review it.",
    },
    ar: { subject: "تم فتح نزاع", line: "تم فتح نزاع على طلبك. سيقوم فريقنا بمراجعته." },
  },
  dispute_resolved: {
    en: { subject: "Your dispute was resolved", line: "A decision has been made on your dispute." },
    ar: { subject: "تم حل النزاع", line: "تم اتخاذ قرار بشأن النزاع الخاص بك." },
  },
};

function renderHtml(line: string, locale: Locale): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const cta = locale === "ar" ? "افتح نايلورك" : "Open Nilework";
  return `<!doctype html><html dir="${dir}"><body style="font-family:system-ui,sans-serif;background:#fafafa;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:24px">
    <p style="font-size:15px;color:#171717;line-height:1.6">${line}</p>
    <a href="${env.WEB_BASE_URL}" style="display:inline-block;margin-top:16px;background:#171717;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">${cta}</a>
  </div></body></html>`;
}

/** Send an email via Resend (best-effort — failures are logged, never thrown). */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: env.RESEND_FROM, to, subject, html }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("sendEmail failed:", err);
  }
}

/**
 * Send the email counterpart of an in-app notification, if the type is emailable
 * and Resend is configured. Resolves the recipient address (Supabase auth) and
 * locale (profile). Best-effort — never blocks or throws into the caller.
 */
export async function dispatchEmail(userId: string, type: string): Promise<void> {
  if (!isEmailConfigured || !EMAIL_COPY[type]) return;
  try {
    const sql = getDb();
    const rows = await sql<{ locale: string }[]>`
      select locale from public.profiles where id = ${userId}
    `;
    const locale: Locale = rows[0]?.locale === "ar" ? "ar" : "en";

    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email) return;

    const copy = EMAIL_COPY[type][locale];
    await sendEmail(email, copy.subject, renderHtml(copy.line, locale));
  } catch (err) {
    console.error("dispatchEmail failed:", err);
  }
}
