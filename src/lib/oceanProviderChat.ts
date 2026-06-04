import type { ChatCompletionInput } from "@/lib/fishLedger";
import { getSelectedOceanProviderConfig } from "@/lib/fishRouter";
import {
  OpenAiCompatibleChatError,
  isOpenAiCompatibleRouteConfigured,
  runOpenAiCompatibleChat,
  type OpenAiCompatibleChatSuccess,
  type OpenAiCompatibleRouteContext
} from "@/lib/openAiCompatibleChat";

export class OceanProviderChatError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function isSelectedOceanProviderChatEnabled(config = getSelectedOceanProviderConfig()) {
  return isOpenAiCompatibleRouteConfigured(config);
}

export async function runSelectedOceanProviderChat(
  input: ChatCompletionInput,
  fallbackTokenEstimate: { promptTokens: number; completionTokens: number },
  routeContext?: OpenAiCompatibleRouteContext
): Promise<OpenAiCompatibleChatSuccess> {
  const config = getSelectedOceanProviderConfig();
  if (!isSelectedOceanProviderChatEnabled(config)) {
    throw new OceanProviderChatError(503, "ocean_provider_not_configured");
  }

  try {
    return await runOpenAiCompatibleChat(input, config, fallbackTokenEstimate, routeContext);
  } catch (error) {
    if (error instanceof OpenAiCompatibleChatError) {
      throw new OceanProviderChatError(error.status, error.message === "openai_compatible_route_not_configured" ? "ocean_provider_not_configured" : "ocean_provider_backend_error");
    }
    throw error;
  }
}
