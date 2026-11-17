import type { LlmProvider } from "./provider.ts";
/**
 * Mistral chat-completions provider. Base URL, model and key are all configurable
 * via env (LLM_BASE_URL, LLM_MODEL, MISTRAL_API_KEY) so another provider can be
 * swapped in without code changes.
 */
export class MistralProvider implements LlmProvider {
  name = "mistral";
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(
    apiKey: string,
    baseUrl: string = process.env.LLM_BASE_URL ?? "https://api.mistral.ai/v1",
    model: string = process.env.LLM_MODEL ?? "mistral-large-latest",
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      throw new Error(`Mistral API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Mistral returned an empty completion");
    return content;
  }
}
