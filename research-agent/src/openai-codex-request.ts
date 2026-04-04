import type { BaseMessage } from "@langchain/core/messages";
import {
  convertMessagesToResponsesInput,
  messageToOpenAIRole,
} from "@langchain/openai";

const DEFAULT_OPENAI_CODEX_INSTRUCTIONS = "You are Codex.";

type OpenAICodexInvocationParams = Omit<Record<string, unknown>, "input">;
export type OpenAICodexRequest = OpenAICodexInvocationParams & {
  instructions: string;
  input: unknown[];
  store: false;
  stream: true;
};

function contentToInstructionText(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  return content
    .flatMap((item) => {
      if (item.type === "text" && typeof item.text === "string") {
        return item.text.trim();
      }

      if (item.type === "input_text" && typeof item["text"] === "string") {
        return item["text"].trim();
      }

      return [];
    })
    .filter((value) => value.length > 0)
    .join("\n\n");
}

export function extractOpenAICodexInstructions(messages: BaseMessage[]): {
  instructions: string;
  inputMessages: BaseMessage[];
} {
  const instructionParts: string[] = [];
  const inputMessages: BaseMessage[] = [];

  for (const message of messages) {
    const role = messageToOpenAIRole(message);
    if (role === "system" || role === "developer") {
      const text = contentToInstructionText(message.content);
      if (text.length > 0) {
        instructionParts.push(text);
      }
      continue;
    }

    inputMessages.push(message);
  }

  return {
    instructions:
      instructionParts.join("\n\n").trim() || DEFAULT_OPENAI_CODEX_INSTRUCTIONS,
    inputMessages,
  };
}

export function createOpenAICodexRequest(args: {
  messages: BaseMessage[];
  model: string;
  zdrEnabled: boolean;
  invocationParams: OpenAICodexInvocationParams;
}): OpenAICodexRequest {
  const { instructions, inputMessages } = extractOpenAICodexInstructions(
    args.messages,
  );

  return {
    ...args.invocationParams,
    instructions,
    input: convertMessagesToResponsesInput({
      messages: inputMessages,
      zdrEnabled: args.zdrEnabled,
      model: args.model,
    }),
    store: false,
    stream: true,
  };
}
