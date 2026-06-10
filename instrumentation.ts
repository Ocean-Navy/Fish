export async function register() {
  // Runs once when a Next.js server instance boots (not during `next build` —
  // and validateEnvAtBoot additionally skips the build phase defensively).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvAtBoot } = await import("@/lib/env");
    validateEnvAtBoot();
  }
}
