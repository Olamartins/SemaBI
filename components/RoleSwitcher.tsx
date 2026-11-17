"use client";

import { useState } from "react";
import type { EffectiveIdentity } from "../lib/types.ts";
export default function RoleSwitcher({ users, current }: { users: Record<string, EffectiveIdentity>; current: string }) {
  const [open, setOpen] = useState(false);
  async function pick(userId: string) {
    await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    window.location.href = "/digest";
  }
  return (
    <div className="relative">
      <button className="btn" onClick={() => setOpen(!open)}>Switch persona</button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-2 z-20">
          {Object.entries(users).map(([id, u]) => (
            <button
              key={id}
              onClick={() => pick(id)}
              className={`block w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-ink-700 ${id === current ? "bg-ink-700" : ""}`}
            >
              <div className="font-medium">{u.displayName}</div>
              <div className="text-xs text-slate-400">{u.roles.join(", ")}{Object.keys(u.rls).length ? ` · RLS ${JSON.stringify(u.rls)}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
