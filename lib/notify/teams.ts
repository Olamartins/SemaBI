import type { Insight } from "../types.ts";
const SEVERITY_COLOR: Record<string, string> = {
  critical: "#f43f5e",
  high: "#f59e0b",
  medium: "#38bdf8",
  low: "#34d399",
};

/** Microsoft Teams adaptive card for one insight (digest item). */
export function buildAdaptiveCard(insight: Insight): Record<string, unknown> {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "Container",
              style: "emphasis",
              items: [
                {
                  type: "TextBlock",
                  text: `SemaBI — ${insight.title}`,
                  weight: "Bolder",
                  size: "Medium",
                  color: "Light",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: `${insight.severity.toUpperCase()} · ${insight.domain} · confidence ${(insight.confidence * 100).toFixed(0)}% · period ${insight.createdPeriod}`,
                  size: "Small",
                  color: "Accent",
                  wrap: true,
                },
              ],
            },
            {
              type: "TextBlock",
              text: insight.narrative,
              wrap: true,
              spacing: "Medium",
            },
            {
              type: "FactSet",
              facts: insight.evidence.slice(0, 6).map((e) => ({
                title: e.label,
                value: `${e.value}${e.unit ? ` ${e.unit}` : ""} (${e.period}) — ${e.measure}`,
              })),
            },
            {
              type: "TextBlock",
              text: `Owner: ${insight.owner} · Route: ${insight.routeTo.join(", ")}${insight.reportUrl ? ` · [Open in Power BI](${insight.reportUrl})` : ""}`,
              size: "Small",
              isSubtle: true,
              wrap: true,
            },
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Drill down in Power BI", url: insight.reportUrl ?? "https://app.powerbi.com" },
            { type: "Action.Submit", title: "Acknowledge", data: { action: "acknowledge", insightId: insight.id } },
          ],
        },
      },
    ],
  };
}

export function severityColor(severity: string): string {
  return SEVERITY_COLOR[severity] ?? "#38bdf8";
}
