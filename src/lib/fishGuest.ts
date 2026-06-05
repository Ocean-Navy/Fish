export const SHARED_GUEST_ID = "shared-anonymous-v1";
export const SHARED_GUEST_PRINCIPAL_ID = `guest:${SHARED_GUEST_ID}`;

export function getSharedGuestIdentity() {
  return {
    guestId: SHARED_GUEST_ID,
    principalId: SHARED_GUEST_PRINCIPAL_ID
  };
}
