import { createHash } from "node:crypto";

const DEFAULT_GUEST_NAMESPACE = "fish-shared-anonymous-guest";

/**
 * Returns the anonymous guest bucket used for unauthenticated demo traffic.
 *
 * Guest access is intentionally deployment-scoped instead of request-scoped:
 * public clients can spoof forwarding headers and user agents, so those values
 * must not decide quota principals or trigger fresh guest credit grants.
 */
export function anonymousGuestId() {
  const namespace = process.env.FISH_GUEST_ID_SALT?.trim() || DEFAULT_GUEST_NAMESPACE;
  return createHash("sha256").update(`fish:guest:v1:${namespace}`).digest("hex").slice(0, 32);
}
