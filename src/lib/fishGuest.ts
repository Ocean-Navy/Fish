import { anonymousGuestId } from "@/lib/guestIdentity";

export function getSharedGuestIdentity() {
  const guestId = anonymousGuestId();
  return {
    guestId,
    principalId: `guest:${guestId}`
  };
}
