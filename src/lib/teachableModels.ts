// Shared list of models that can be "taught" via knowledge entries.
// Image/video generation models are intentionally excluded — knowledge entries
// only apply to text-generation models.

export interface TeachableModel {
  id: string;
  display_name: string;
  name: string;
  group: "Orchestrator" | "OpenRouter" | "Cloudflare";
}

export const SPECIAL_TEACHABLE_MODELS: TeachableModel[] = [
  {
    id: "@ultra/orchestrator",
    display_name: "ULTRA (all routed models)",
    name: "ultra",
    group: "Orchestrator",
  },
  {
    id: "@openrouter/gpt-oss-120b",
    display_name: "GPT-OSS-120B",
    name: "gpt-oss-120b",
    group: "OpenRouter",
  },
  {
    id: "@openrouter/gemma-4-31b",
    display_name: "Gemma 4 31B",
    name: "gemma-4-31b",
    group: "OpenRouter",
  },
  {
    id: "@openrouter/nemotron-3-super",
    display_name: "Nemotron 3 Super",
    name: "nemotron-3-super",
    group: "OpenRouter",
  },
];
