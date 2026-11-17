import type { Severity } from "../lib/types.ts";
const STYLES: Record<Severity, string> = {
  critical: "bg-danger/20 text-danger border-danger/50",
  high: "bg-warn/20 text-warn border-warn/50",
  medium: "bg-accent/20 text-accent border-accent/40",
  low: "bg-ok/20 text-ok border-ok/40",
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge border ${STYLES[severity]}`}>{severity.toUpperCase()}</span>;
}
