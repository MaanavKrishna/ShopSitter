import { anthropic } from "@ai-sdk/anthropic";
import { type ToolSet, generateText, stepCountIs, tool } from "ai";
import type { AskModel } from "./ask";

/** Rounds of tool calls before the model must answer. */
const MAX_STEPS = 5;

/** Asks the language model. It sees each lookup's facts and nothing else. Throws on timeout or model failure. */
export const askModel: AskModel = async ({ instructions, prompt, tools }) => {
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = tool({
      description: t.description,
      inputSchema: t.schema,
      execute: async (args: unknown) => (await t.run(args)).facts,
    });
  }
  const { text } = await generateText({
    model: anthropic(process.env.ASK_MODEL || "claude-haiku-5-5"),
    instructions,
    prompt,
    tools: set,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 500,
    maxRetries: 1,
    timeout: 20_000,
  });
  return { text };
};
