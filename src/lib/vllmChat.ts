import type { ChatCompletionInput } from "@/lib/fishLedger";
import { getWarmInferenceConfig } from "@/lib/fishRouter";
import {
  OpenAiCompatibleChatError,
  isOpenAiCompatibleRouteConfigured,
  runOpenAiCompatibleChat,
  type OpenAiCompatibleChatSuccess
} from "@/lib/openAiCompatibleChat";

export class VllmChatError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function isVllmChatEnabled(config = getWarmInferenceConfig()) {
  return isOpenAiCompatibleRouteConfigured(config);
}

export async function runVllmChat(input: ChatCompletionInput, fallbackTokenEstimate: { promptTokens: number; completionTokens: number }): Promise<OpenAiCompatibleChatSuccess> {
  const config = getWarmInferenceConfig();
  if (!isVllmChatEnabled(config)) {
    throw new VllmChatError(503, "ocean_demo_vllm_not_configured");
  }

  try {
    return await runOpenAiCompatibleChat(input, config, fallbackTokenEstimate);
  } catch (error) {
    if (error instanceof OpenAiCompatibleChatError) {
      throw new VllmChatError(error.status, error.message === "openai_compatible_route_not_configured" ? "ocean_demo_vllm_not_configured" : "ocean_demo_vllm_backend_error");
    }
    throw error;
  }
}
