import { createHash } from "node:crypto";

const DEFAULT_GUEST_NAMESPACE = "fish-shared-anonymous-guest";
const GUEST_IDENTITY_SALT_ERROR = "guest_identity_salt_required";

export type AnonymousGuestIdentity =
  | {
      ok: true;
      guestId: string;
      principalId: string;
    }
  | {
      ok: false;
      status: 503;
      error: typeof GUEST_IDENTITY_SALT_ERROR;
    };

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

export function anonymousGuestIdentityStatus() {
  const saltConfigured = Boolean(process.env.FISH_GUEST_ID_SALT?.trim());
  const saltRequired = process.env.NODE_ENV === "production";
  return {
    saltConfigured,
    saltRequired,
    ready: saltConfigured || !saltRequired
  };
}

export function resolveAnonymousGuestIdentity(): AnonymousGuestIdentity {
  const status = anonymousGuestIdentityStatus();
  if (!status.ready) {
    return {
      ok: false,
      status: 503,
      error: GUEST_IDENTITY_SALT_ERROR
    };
  }
  const guestId = anonymousGuestId();
  return {
    ok: true,
    guestId,
    principalId: `guest:${guestId}`
  };
}
