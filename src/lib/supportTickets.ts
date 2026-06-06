import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { z } from "zod";

const supportKindSchema = z.enum(["billing", "refund", "technical", "privacy", "provider", "other"]);

export const supportTicketSchema = z.object({
  contact: z.string().trim().min(3).max(240),
  kind: supportKindSchema.default("other"),
  accountOrPaymentRef: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(5).max(1200),
  company: z.string().trim().max(0).optional().default("")
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type SupportTicketKind = z.infer<typeof supportKindSchema>;

const storedSupportTicketSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  body: supportTicketSchema.omit({ company: true }).passthrough()
});

export type StoredSupportTicket = {
  id: string;
  createdAt: string;
  body: Omit<SupportTicketInput, "company">;
};

export async function saveSupportTicket(body: unknown) {
  const parsed = supportTicketSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      error: "invalid_support_ticket",
      issues: parsed.error.flatten().fieldErrors
    };
  }

  const data = {
    contact: parsed.data.contact,
    kind: parsed.data.kind,
    accountOrPaymentRef: parsed.data.accountOrPaymentRef,
    message: parsed.data.message
  };
  const id = `support_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const payload = {
    id,
    createdAt: now,
    body: data
  };

  await mkdir(supportDir(), { recursive: true });
  await writeFile(`${supportDir()}/${id}.json`, JSON.stringify(payload, null, 2));
  return { ok: true as const, status: 200, id };
}

export async function listSupportTickets(kind: SupportTicketKind | "all" = "all"): Promise<StoredSupportTicket[]> {
  try {
    const files = await readdir(supportDir());
    const rows = await Promise.all(files.filter((file) => file.endsWith(".json")).map(readStoredSupportTicket));

    return rows
      .filter((row): row is StoredSupportTicket => Boolean(row))
      .filter((row) => kind === "all" || row.body.kind === kind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function readStoredSupportTicket(file: string): Promise<StoredSupportTicket | null> {
  try {
    const raw = await readFile(`${supportDir()}/${file}`, "utf8");
    const parsed = storedSupportTicketSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.id,
      createdAt: parsed.data.createdAt,
      body: parsed.data.body
    };
  } catch {
    return null;
  }
}

function supportDir() {
  return process.env.FISH_SUPPORT_DIR || "data/support";
}
