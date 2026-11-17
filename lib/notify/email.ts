import type { Insight } from "../types.ts";
export interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
}

/** Resend API sender. Without RESEND_API_KEY the digest is logged instead of sent. */
export async function sendEmail(payload: EmailPayload): Promise<{ sent: boolean; provider: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] (dry-run) to=${payload.to.join(",")} subject="${payload.subject}"`);
    return { sent: false, provider: "dry-run" };
  }
  const from = process.env.RESEND_FROM ?? "SemaBI <digest@semabi.example>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html }),
  });
  if (!res.ok) return { sent: false, provider: "resend", error: `${res.status} ${await res.text()}` };
  return { sent: true, provider: "resend" };
}

export function digestEmailHtml(role: string, insights: Insight[], date: string): string {
  const items = insights
    .map(
      (i) => `<div style="border-left:4px solid #444;padding:8px 12px;margin:8px 0">
        <b>${i.title}</b> <span style="color:#888">(${i.severity}, ${i.domain}, ${(i.confidence * 100).toFixed(0)}% confidence, ${i.createdPeriod})</span><br/>
        ${i.narrative}<br/>
        <span style="color:#888;font-size:12px">Owner: ${i.owner} · ${i.evidence.slice(0, 3).map((e) => `${e.label} ${e.value}${e.unit} (${e.period})`).join(" · ")}</span>
      </div>`,
    )
    .join("");
  return `<h2>SemaBI Morning Digest — ${role} — ${date}</h2>${items || "<p>No new insights today.</p>"}`;
}
