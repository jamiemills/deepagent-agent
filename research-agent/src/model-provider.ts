import type {
  BaseLanguageModel,
  BaseLanguageModelCallOptions,
} from "@langchain/core/language_models/base";

export type ResearchModelProvider = "vertex" | "openai" | "anthropic";
export type ResearchChatModel = BaseLanguageModel<
  unknown,
  BaseLanguageModelCallOptions
>;

export type ResearchModelConfig = {
  researchAgentModelProvider: ResearchModelProvider;
  researchAgentModel: string;
  openAiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
};

type ModelOptions = Record<string, unknown>;

type CreateModelDeps = {
  createVertexModel?: (options: ModelOptions) => ResearchChatModel;
  createOpenAIModel?: (options: ModelOptions) => ResearchChatModel;
  createAnthropicModel?: (options: ModelOptions) => ResearchChatModel;
};

async function loadVertexFactory() {
  try {
    const { ChatGoogle } = await import("@langchain/google/node");
    return (options: ModelOptions) => new ChatGoogle(options as never);
  } catch (error) {
    throw new Error(
      `Vertex model support is unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function loadOpenAIFactory() {
  try {
    const { ChatOpenAI } = await import("@langchain/openai");
    return (options: ModelOptions) => new ChatOpenAI(options as never);
  } catch (error) {
    throw new Error(
      `OpenAI model support requires @langchain/openai: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function loadAnthropicFactory() {
  try {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return (options: ModelOptions) => new ChatAnthropic(options as never);
  } catch (error) {
    throw new Error(
      `Anthropic model support requires @langchain/anthropic: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function createResearchModel(
  config: ResearchModelConfig,
  deps: CreateModelDeps = {},
): Promise<ResearchChatModel> {
  switch (config.researchAgentModelProvider) {
    case "openai": {
      const createOpenAIModel =
        deps.createOpenAIModel ?? (await loadOpenAIFactory());
      return createOpenAIModel({
        model: config.researchAgentModel,
        apiKey: config.openAiApiKey,
        maxRetries: 2,
      });
    }

    case "anthropic": {
      const createAnthropicModel =
        deps.createAnthropicModel ?? (await loadAnthropicFactory());
      return createAnthropicModel({
        model: config.researchAgentModel,
        apiKey: config.anthropicApiKey,
        maxRetries: 2,
      });
    }

    default: {
      const createVertexModel =
        deps.createVertexModel ?? (await loadVertexFactory());
      return createVertexModel({
        model: config.researchAgentModel,
        platformType: "gcp",
        maxRetries: 2,
      });
    }
  }
}
