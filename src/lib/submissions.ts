import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { z } from "zod";

const SUBMISSIONS_DIR = path.join(process.cwd(), "data", "submissions");
const DEFAULT_MAX_PUBLIC_SUBMISSIONS_PER_KIND = 1000;
const SUBMISSION_LOCK_STALE_MS = 30_000;
const SUBMISSION_LOCK_RETRY_MS = 10;

const roleSchema = z.enum(["user", "developer", "provider", "oceanHolder"]);
export type SubmissionKind = "waitlist" | "provider";

export const interestSubmissionSchema = z.object({
  contact: z.string().trim().min(3).max(240),
  subscriberRoles: z.array(roleSchema).min(1).max(4),
  useCase: z.string().trim().max(800).optional().default(""),
  expectedUsage: z.string().trim().max(200).optional().default(""),
  nodeEndpoint: z.string().trim().max(500).optional().default(""),
  healthEndpoint: z.string().trim().max(500).optional().default(""),
  gpuType: z.string().trim().max(200).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  priceHint: z.string().trim().max(160).optional().default(""),
  payoutPreference: z.string().trim().max(120).optional().default(""),
  supportContact: z.string().trim().max(240).optional().default(""),
  approvedContainer: z.string().trim().max(240).optional().default(""),
  noLoggingPolicy: z
    .preprocess((value) => value === true || value === "true" || value === "yes" || value === "on", z.boolean())
    .optional()
    .default(false),
  notes: z.string().trim().max(1200).optional().default(""),
  company: z.string().trim().max(0).optional().default("")
});

export type InterestSubmissionInput = z.infer<typeof interestSubmissionSchema>;

const storedSubmissionSchema = z.object({
  id: z.string(),
  kind: z.enum(["waitlist", "provider"]),
  createdAt: z.string(),
  body: interestSubmissionSchema.omit({ company: true }).passthrough()
});

export type StoredSubmission = {
  id: string;
  kind: SubmissionKind;
  createdAt: string;
  body: Omit<InterestSubmissionInput, "company">;
};

export async function saveSubmission(kind: SubmissionKind, body: unknown) {
  const parsed = interestSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      error: "invalid_submission",
      issues: parsed.error.flatten().fieldErrors
    };
  }

  const data = parsed.data;
  if (kind === "provider" && !data.subscriberRoles.includes("provider")) {
    data.subscriberRoles.push("provider");
  }

  return withSubmissionLock(kind, async () => {
    const limit = maxPublicSubmissionsPerKind();
    const existing = await countSubmissionFiles(kind);
    if (existing >= limit) {
      return {
        ok: false as const,
        status: 429,
        error: "submission_limit_reached",
        limit
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = {
      id,
      kind,
      createdAt: now,
      body: {
        ...data,
        company: undefined
      }
    };

    await writeFile(path.join(SUBMISSIONS_DIR, `${kind}-${id}.json`), JSON.stringify(payload, null, 2));
    return { ok: true as const, status: 200, id };
  });
}

export async function listSubmissions(kind: SubmissionKind | "all" = "all"): Promise<StoredSubmission[]> {
  try {
    const files = await readdir(SUBMISSIONS_DIR);
    const prefix = kind === "all" ? null : `${kind}-`;
    const rows = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .filter((file) => (prefix ? file.startsWith(prefix) : file.startsWith("waitlist-") || file.startsWith("provider-")))
        .map(readStoredSubmission)
    );

    return rows
      .filter((row): row is StoredSubmission => Boolean(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function readStoredSubmission(file: string): Promise<StoredSubmission | null> {
  try {
    const raw = await readFile(path.join(SUBMISSIONS_DIR, file), "utf8");
    const parsed = storedSubmissionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.id,
      kind: parsed.data.kind,
      createdAt: parsed.data.createdAt,
      body: parsed.data.body
    };
  } catch {
    return null;
  }
}

async function countSubmissionFiles(kind: SubmissionKind) {
  try {
    const files = await readdir(SUBMISSIONS_DIR);
    return files.filter((file) => file.startsWith(`${kind}-`) && file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function maxPublicSubmissionsPerKind() {
  return readPositiveInt(process.env.FISH_MAX_PUBLIC_SUBMISSIONS_PER_KIND ?? process.env.FISH_MAX_SUBMISSIONS_PER_KIND, DEFAULT_MAX_PUBLIC_SUBMISSIONS_PER_KIND);
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function withSubmissionLock<T>(kind: SubmissionKind, operation: () => Promise<T>) {
  await mkdir(SUBMISSIONS_DIR, { recursive: true });
  const lockPath = path.join(SUBMISSIONS_DIR, `.${kind}.lock`);
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid}:${new Date().toISOString()}`);
        return await operation();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleSubmissionLock(lockPath)) {
        continue;
      }
      await sleep(SUBMISSION_LOCK_RETRY_MS);
    }
  }
}

async function removeStaleSubmissionLock(lockPath: string) {
  try {
    const fileStat = await stat(lockPath);
    if (Date.now() - fileStat.mtimeMs <= SUBMISSION_LOCK_STALE_MS) {
      return false;
    }
    await rm(lockPath, { force: true });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
