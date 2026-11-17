import { MistralProvider } from "./mistral.ts";
import { TemplateProvider } from "./template.ts";

export interface LlmProvider {
  name: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Provider is configurable via LLM_PROVIDER (default "mistral"). Without an API key
 * the deterministic template provider is used — LLM failure must never block the digest.
 */
export function createProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER ?? "mistral").toLowerCase();
  const apiKey = process.env.MISTRAL_API_KEY ?? process.env.LLM_API_KEY;
  if (provider === "mistral" && apiKey) {
    return new MistralProvider(apiKey);
  }
  return new TemplateProvider();
}
