import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { ChatOpenAIResponses } from "@langchain/openai";
import { convertResponsesDeltaToChatGenerationChunk } from "@langchain/openai";

import { createOpenAICodexRequest } from "./openai-codex-request.js";

export class ChatOpenAICodex extends ChatOpenAIResponses {
  override async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    options.signal?.throwIfAborted();

    const stream = this._streamResponseChunks(messages, options, runManager);
    let finalChunk: ChatGenerationChunk | undefined;
    for await (const chunk of stream) {
      chunk.message.response_metadata = {
        ...chunk.generationInfo,
        ...chunk.message.response_metadata,
      };
      finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk;
    }

    return {
      generations: finalChunk ? [finalChunk] : [],
      llmOutput: {
        estimatedTokenUsage: (
          finalChunk?.message as { usage_metadata?: unknown }
        )?.usage_metadata,
      },
    };
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ) {
    const request = createOpenAICodexRequest({
      messages,
      model: this.model,
      zdrEnabled: this.zdrEnabled ?? false,
      invocationParams: this.invocationParams(options),
    });

    const streamIterable = (await this.completionWithRetry(
      request as never,
      options,
    )) as AsyncIterable<unknown>;

    for await (const data of streamIterable) {
      if (options.signal?.aborted) {
        return;
      }

      const chunk = convertResponsesDeltaToChatGenerationChunk(data as never);
      if (chunk == null) {
        continue;
      }

      yield chunk;
      await runManager?.handleLLMNewToken(
        chunk.text || "",
        {
          prompt: options.promptIndex ?? 0,
          completion: 0,
        },
        undefined,
        undefined,
        undefined,
        { chunk },
      );
    }
  }
}
