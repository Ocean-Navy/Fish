#!/usr/bin/env python3
"""Fish Docs Bento Summary algorithm.

This algorithm is intentionally dependency-free so the first Ocean compute
proof can run in the standard Ocean Python algorithm container. It reads text
files from the Ocean compute input directory when datasets are present. If the
first proof is run with no datasets, it still writes a deterministic proof
payload so Fish can verify that a real Ocean job executed and returned output.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_INPUT_DIRS = ("/data/inputs", "/data/ddos")
DEFAULT_OUTPUT_DIR = "/data/outputs"
MAX_FILE_BYTES = 512_000
MAX_TOTAL_BYTES = 1_500_000
MAX_SUMMARY_SENTENCES = 5
MAX_BULLETS = 5


def main() -> None:
    input_dirs = read_path_list("FISH_ALGO_INPUT_DIRS", DEFAULT_INPUT_DIRS)
    output_dir = Path(os.getenv("FISH_ALGO_OUTPUT_DIR", DEFAULT_OUTPUT_DIR))
    output_dir.mkdir(parents=True, exist_ok=True)

    documents = read_documents(input_dirs)
    input_bundle = "\n\n".join(document["text"] for document in documents)
    created_at = datetime.now(timezone.utc).isoformat()

    if input_bundle.strip():
        summary_sentences = summarize(input_bundle)
        bullets = make_bullets(summary_sentences)
        mode = "dataset_summary"
    else:
        summary_sentences = [
            "Fish Docs Bento Summary ran as a no-dataset Ocean compute proof and wrote this output from inside the compute job."
        ]
        bullets = [
            "Ocean compute job executed.",
            "Algorithm container produced an output file.",
            "Fish can hash this result without storing prompt or output text in public receipts.",
        ]
        mode = "no_dataset_proof"

    output = {
        "schemaVersion": 1,
        "algorithm": "fish-document-summary",
        "algorithmVersion": "0.1.0",
        "taskType": "document_summary",
        "mode": mode,
        "createdAt": created_at,
        "source": {
            "inputDirectories": [str(path) for path in input_dirs],
            "inputFileCount": len(documents),
            "inputByteCount": sum(document["byteCount"] for document in documents),
            "inputBundleHash": sha256_text(input_bundle),
            "dids": split_env("DIDS"),
            "transformationDid": os.getenv("TRANSFORMATION_DID", ""),
        },
        "summary": " ".join(summary_sentences),
        "bullets": bullets,
        "documents": [
            {
                "path": document["path"],
                "byteCount": document["byteCount"],
                "sha256": document["sha256"],
            }
            for document in documents
        ],
    }
    output["outputHash"] = sha256_json(output)

    write_json(output_dir / "fish-document-summary.json", output)
    write_text(output_dir / "summary.txt", output["summary"] + "\n")
    write_json(
        output_dir / "fish-proof-receipt.json",
        {
            "algorithm": output["algorithm"],
            "algorithmVersion": output["algorithmVersion"],
            "taskType": output["taskType"],
            "mode": output["mode"],
            "createdAt": output["createdAt"],
            "inputBundleHash": output["source"]["inputBundleHash"],
            "outputHash": output["outputHash"],
            "storesPromptOutputText": False,
        },
    )


def read_path_list(env_name: str, defaults: Iterable[str]) -> list[Path]:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return [Path(value) for value in defaults]
    return [Path(value.strip()) for value in raw.split(":") if value.strip()]


def split_env(env_name: str) -> list[str]:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return []
    return [value.strip() for value in raw.split(",") if value.strip()]


def read_documents(input_dirs: list[Path]) -> list[dict[str, object]]:
    documents: list[dict[str, object]] = []
    total_bytes = 0
    for input_dir in input_dirs:
        if not input_dir.exists():
            continue
        for file_path in sorted(path for path in input_dir.rglob("*") if path.is_file()):
            if total_bytes >= MAX_TOTAL_BYTES:
                return documents
            content = file_path.read_bytes()[:MAX_FILE_BYTES]
            total_bytes += len(content)
            text = decode_text(content)
            if not text.strip():
                continue
            documents.append(
                {
                    "path": str(file_path),
                    "byteCount": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "text": text,
                }
            )
    return documents


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def summarize(text: str) -> list[str]:
    sentences = split_sentences(normalize_space(text))
    if not sentences:
        return ["No readable text was found in the provided dataset files."]

    words = [word for word in tokenize(text) if word not in stop_words()]
    frequencies = Counter(words)
    scored: list[tuple[float, int, str]] = []
    for index, sentence in enumerate(sentences[:80]):
        sentence_words = [word for word in tokenize(sentence) if word not in stop_words()]
        if not sentence_words:
            continue
        score = sum(frequencies[word] for word in sentence_words) / max(1, len(sentence_words))
        score += max(0, 1.0 - index / 80) * 0.25
        scored.append((score, index, sentence))

    selected = sorted(scored, reverse=True)[:MAX_SUMMARY_SENTENCES]
    selected.sort(key=lambda item: item[1])
    return [sentence for _, _, sentence in selected] or [sentences[0]]


def make_bullets(sentences: list[str]) -> list[str]:
    bullets: list[str] = []
    for sentence in sentences:
        short = sentence.strip()
        if len(short) > 180:
            short = short[:177].rstrip() + "..."
        bullets.append(short)
        if len(bullets) >= MAX_BULLETS:
            break
    return bullets


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [part.strip() for part in parts if 20 <= len(part.strip()) <= 500]


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", text.lower())


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def stop_words() -> set[str]:
    return {
        "about",
        "after",
        "again",
        "also",
        "and",
        "are",
        "because",
        "been",
        "but",
        "can",
        "for",
        "from",
        "has",
        "have",
        "into",
        "not",
        "our",
        "that",
        "the",
        "their",
        "this",
        "with",
        "you",
        "your",
    }


def sha256_text(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: dict[str, object]) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return sha256_text(canonical)


def write_json(path: Path, value: dict[str, object]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8")


if __name__ == "__main__":
    main()
