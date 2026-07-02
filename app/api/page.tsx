import { permanentRedirect } from "next/navigation";

// The /api status page merged into /docs (endpoint board lives there, behind
// Advanced mode). This keeps old links working; the merge is permanent, so
// send a 308 and let clients update their bookmarks.
export default function ApiPage() {
  permanentRedirect("/docs");
}
