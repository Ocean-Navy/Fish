/**
 * Plain-language copy for Fish API errors shown to end users (audit gap #1).
 * Raw error codes stay visible as small print for support, but the headline
 * and body must be understandable by someone who has never seen the codebase.
 */

export type FishOrderErrorCopy = {
  title: string;
  body: string;
  /** Optional in-app action, e.g. where to get credits. */
  action?: { href: string; label: string };
  /** The raw code, for small-print display. */
  code: string;
};

type ErrorPayloadShape = {
  error?: {
    message?: string;
    needed?: number;
    available?: number;
    limit?: number;
    remaining?: number;
    resetAt?: string;
  };
};

export function describeFishOrderError(status: number, payload: unknown): FishOrderErrorCopy {
  const error = payload && typeof payload === "object" ? (payload as ErrorPayloadShape).error : undefined;
  const code = typeof error?.message === "string" && error.message ? error.message : `http_${status}`;

  if (code === "insufficient_fish_credits") {
    return {
      title: "Out of Fish credits",
      body: `This order needs ${error?.needed ?? "more"} credit${error?.needed === 1 ? "" : "s"}; ${error?.available ?? 0} left. Top up or stake to keep ordering.`,
      action: { href: "/credits", label: "See credit options" },
      code
    };
  }
  if (code === "daily_quota_exceeded") {
    return {
      title: "Today's free tastes are finished",
      body: "The daily demo quota resets at midnight UTC. Come back tomorrow, or use an API key for a bigger allowance.",
      code
    };
  }
  if (code === "rate_limit_exceeded") {
    return {
      title: "A little too fast",
      body: `You hit the per-minute limit${typeof error?.resetAt === "string" ? "; it resets shortly" : ""}. Wait a moment and try again.`,
      code
    };
  }
  if (code === "monthly_request_limit_exceeded") {
    return {
      title: "Monthly request limit reached",
      body: "This plan's monthly request allowance is used up. It resets at the start of next month.",
      code
    };
  }
  if (code === "max_concurrent_requests_exceeded") {
    return {
      title: "The kitchen is at capacity",
      body: "Too many orders are cooking at once. Wait a few seconds and try again.",
      code
    };
  }
  if (code === "daily_route_budget_exceeded") {
    return {
      title: "Today's kitchen budget is spent",
      body: "The daily spending cap for this route is used up. It resets tomorrow — this keeps the demo's costs honest.",
      code
    };
  }
  if (code === "missing_bearer_token" || code === "invalid_api_key" || code === "api_key_revoked" || code === "stale_api_key") {
    return {
      title: "That key didn't work",
      body:
        code === "api_key_revoked"
          ? "This API key was revoked. Use a current key, or ask the operator for a new one."
          : "Check the API key in Details — it should start with fish_sk_. Quick Catch works without a key.",
      code
    };
  }
  if (code === "guest_identity_salt_required") {
    return {
      title: "Guest tastings are closed right now",
      body: "The demo's guest access isn't fully configured on this server. The operator has been notified by the logs; try again later or use an API key.",
      code
    };
  }
  if (code === "fish_router_paused" || code === "fish_router_disabled") {
    return {
      title: "The counter is paused",
      body: "The operator paused AI orders for a moment. Nothing is wrong with your account — try again soon.",
      code
    };
  }
  if (code.endsWith("_not_configured")) {
    return {
      title: "This route isn't set up yet",
      body: "The selected AI route is still being configured. Try again later — or tell the operator if this persists.",
      code
    };
  }
  if (code.endsWith("_timeout")) {
    return {
      title: "The AI kitchen took too long",
      body: "The backend didn't answer in time, so the order was cancelled and reserved credits were released. Try again.",
      code
    };
  }
  if (code.endsWith("_backend_error") || status === 502 || status === 504) {
    return {
      title: "The AI kitchen didn't answer",
      body: "The model backend failed for this order. Reserved credits were released and nothing was charged. Try again in a moment.",
      code
    };
  }
  if (code.endsWith("_not_allowed_for_plan")) {
    return {
      title: "This dish needs a bigger plan",
      body: "Your current plan doesn't include this route. Pick another dish, or ask the operator about plan options.",
      code
    };
  }
  if (code === "fish_feature_not_enabled") {
    return {
      title: "Coming soon",
      body: "This dish isn't enabled in the current pilot yet.",
      code
    };
  }
  if (code === "max_input_tokens_exceeded") {
    return {
      title: "That order is too long",
      body: "Shorten the text and try again — this dish has an input size cap to keep the demo fair.",
      code
    };
  }
  if (code === "max_output_tokens_exceeded") {
    return {
      title: "Requested answer is too long",
      body: "Lower the requested length — this dish has an output size cap.",
      code
    };
  }
  if (status === 400) {
    return {
      title: "Fish couldn't read that order",
      body: "Something about the request wasn't valid. Adjust the text and try again.",
      code
    };
  }
  if (status === 503) {
    return {
      title: "The counter is closed right now",
      body: "This part of the demo isn't available at the moment. Try again later.",
      code
    };
  }
  return {
    title: "That order didn't go through",
    body: "Something unexpected happened. Try again — and if it keeps failing, send a support ticket.",
    code
  };
}
