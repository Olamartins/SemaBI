import { json } from "../../../lib/api-helpers.ts";

export async function GET() {
  return json({ ok: true, service: "semabi", mode: process.env.SEMABI_MODE ?? "demo", time: new Date().toISOString() });
}
