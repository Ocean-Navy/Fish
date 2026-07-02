import { permanentRedirect } from "next/navigation";

// /chat and /ask were duplicate meal-counter pages with identical titles.
// /ask is the canonical counter; this keeps old /chat links working. The
// merge is permanent, so send a 308.
export default function ChatPage() {
  permanentRedirect("/ask");
}
