import type { AppRole, EffectiveIdentity, Insight } from "../types.ts";
export const ALL_ROLES: AppRole[] = ["CRO", "ALCO", "CFO", "RISK", "CREDIT_COMMITTEE", "BI_ADMIN"];

/** Demo directory: role -> entitlements + RLS scope. */
export const DEMO_USERS: Record<string, EffectiveIdentity> = {
  "cro@firstmeridian.demo": { userId: "cro@firstmeridian.demo", displayName: "Adaeze Okafor (CRO)", roles: ["CRO"], rls: {}, mode: "delegated" },
  "alco@firstmeridian.demo": { userId: "alco@firstmeridian.demo", displayName: "Tunde Balogun (ALCO)", roles: ["ALCO"], rls: {}, mode: "delegated" },
  "cfo@firstmeridian.demo": { userId: "cfo@firstmeridian.demo", displayName: "Ngozi Eze (CFO)", roles: ["CFO"], rls: {}, mode: "delegated" },
  "risk@firstmeridian.demo": { userId: "risk@firstmeridian.demo", displayName: "Chidi Nwosu (Head of Credit Risk)", roles: ["RISK", "CRO"], rls: {}, mode: "delegated" },
  "crc@firstmeridian.demo": { userId: "crc@firstmeridian.demo", displayName: "Credit Risk Committee", roles: ["CREDIT_COMMITTEE"], rls: {}, mode: "delegated" },
  "biadmin@firstmeridian.demo": { userId: "biadmin@firstmeridian.demo", displayName: "BI Admin", roles: ["BI_ADMIN"], rls: {}, mode: "delegated" },
  // RLS-restricted user: tenant RLS limits them to Retail + SME segments (e.g. a regional head).
  "regional@firstmeridian.demo": { userId: "regional@firstmeridian.demo", displayName: "Regional Head (RLS: Retail/SME only)", roles: ["RISK"], rls: { segments: ["Retail", "SME"] }, mode: "delegated" },
};

export function demoIdentity(userId?: string): EffectiveIdentity {
  const id = userId && DEMO_USERS[userId] ? userId : process.env.SEMABI_DEMO_USER ?? "cro@firstmeridian.demo";
  const identity = DEMO_USERS[id] ?? DEMO_USERS["cro@firstmeridian.demo"];
  return { ...identity, rls: { ...identity.rls } };
}

/** Which domains each role is entitled to see in digests / explorer. */
const ROLE_DOMAINS: Record<AppRole, string[]> = {
  CRO: ["asset_quality", "concentration", "capital"],
  ALCO: ["liquidity", "profitability", "capital"],
  CFO: ["capital", "profitability", "liquidity"],
  RISK: ["asset_quality", "concentration"],
  CREDIT_COMMITTEE: ["concentration", "asset_quality"],
  BI_ADMIN: ["asset_quality", "capital", "liquidity", "profitability", "concentration"],
};

export function roleSeesInsight(role: AppRole, insight: Insight): boolean {
  if (insight.routeTo.includes(role)) return true;
  return ROLE_DOMAINS[role]?.includes(insight.domain) ?? false;
}

export function canAdmin(role: AppRole[]): boolean {
  return role.includes("BI_ADMIN");
}
