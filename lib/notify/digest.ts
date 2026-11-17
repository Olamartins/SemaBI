import type { AppRole, Insight } from "../types.ts";
import { roleSeesInsight } from "../auth/roles.ts";
import { buildAdaptiveCard } from "./teams.ts";
import { digestEmailHtml, sendEmail } from "./email.ts";

export interface Digest {
  role: AppRole;
  date: string;
  subject: string;
  insights: Insight[];
  teamsCards: Record<string, unknown>[];
  emailHtml: string;
}

/** Compose the 07:00 per-role digest from current open insights. */
export function composeDigest(role: AppRole, insights: Insight[], date: string): Digest {
  const mine = insights.filter((i) => roleSeesInsight(role, i) && (i.status === "new" || i.status === "acknowledged" || i.status === "assigned"));
  const subject = `SemaBI Morning Digest — ${role} — ${date} — ${mine.length} insight(s)`;
  return {
    role,
    date,
    subject,
    insights: mine,
    teamsCards: mine.map((i) => buildAdaptiveCard(i)),
    emailHtml: digestEmailHtml(role, mine, date),
  };
}

/** Deliver a digest: email + Teams webhook (both no-op gracefully without config). */
export async function deliverDigest(digest: Digest, to: string[]): Promise<{ email: unknown; teams: unknown }> {
  const email = await sendEmail({ to, subject: digest.subject, html: digest.emailHtml });
  let teams: unknown = { sent: false, provider: "dry-run" };
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (url) {
    for (const card of digest.teamsCards) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
      if (!res.ok) teams = { sent: false, provider: "teams", error: `${res.status}` };
      else teams = { sent: true, provider: "teams" };
    }
  } else {
    console.log(`[teams] (dry-run) ${digest.teamsCards.length} card(s) for ${digest.role}`);
  }
  return { email, teams };
}
