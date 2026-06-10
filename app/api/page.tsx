import { redirect } from "next/navigation";

// The /api status page merged into /docs (endpoint board lives there, behind
// Advanced mode). This keeps old links working.
export default function ApiPage() {
  redirect("/docs");
}
