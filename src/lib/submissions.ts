import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const SUBMISSIONS_DIR = path.join(process.cwd(), "data", "submissions");

const roleSchema = z.enum(["user", "developer", "provider", "oceanHolder"]);
export type SubmissionKind = "waitlist" | "provider";

export const interestSubmissionSchema = z.object({
  contact: z.string().trim().min(3).max(240),
  subscriberRoles: z.array(roleSchema).min(1).max(4),
  useCase: z.string().trim().max(800).optional().default(""),
  expectedUsage: z.string().trim().max(200).optional().default(""),
  nodeEndpoint: z.string().trim().max(500).optional().default(""),
  gpuType: z.string().trim().max(200).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  payoutPreference: z.string().trim().max(120).optional().default(""),
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

  await mkdir(SUBMISSIONS_DIR, { recursive: true });
  await writeFile(path.join(SUBMISSIONS_DIR, `${kind}-${id}.json`), JSON.stringify(payload, null, 2));
  return { ok: true as const, status: 200, id };
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
