const DEFAULT_JSON_BODY_MAX_BYTES = 128 * 1024;

export type JsonRequestBodyResult =
  | {
      ok: true;
      body: unknown;
    }
  | {
      ok: false;
      status: 400 | 413;
      error: "invalid_json_body" | "request_body_too_large";
      maxBytes: number;
    };

export async function readJsonRequestBody(request: Request, options: { maxBytes?: number } = {}): Promise<JsonRequestBodyResult> {
  const maxBytes = positiveInteger(options.maxBytes, positiveInteger(Number(process.env.FISH_MAX_JSON_BODY_BYTES), DEFAULT_JSON_BODY_MAX_BYTES));
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, status: 413, error: "request_body_too_large", maxBytes };
    }
  }

  const body = request.body;
  if (!body) {
    return { ok: true, body: {} };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        return { ok: false, status: 413, error: "request_body_too_large", maxBytes };
      }
      chunks.push(value);
    }
  }

  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8").trim();
  if (!raw) {
    return { ok: true, body: {} };
  }

  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json_body", maxBytes };
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
