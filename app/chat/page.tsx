import { redirect } from "next/navigation";

// /chat and /ask were duplicate meal-counter pages with identical titles.
// /ask is the canonical counter; this keeps old /chat links working.
export default function ChatPage() {
  redirect("/ask");
}
