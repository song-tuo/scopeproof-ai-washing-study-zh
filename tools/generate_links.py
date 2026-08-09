#!/usr/bin/env python3
"""Generate balanced participant URLs for ScopeProof v0.7."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path
from urllib.parse import urlencode


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=112)
    parser.add_argument(
        "--base-url",
        default="https://song-tuo.github.io/scopeproof-ai-washing-study-zh/",
    )
    parser.add_argument("--seed", type=int, default=20260810)
    parser.add_argument("--out", type=Path, default=Path("participant_links.csv"))
    args = parser.parse_args()

    if args.n < 2 or args.n % 2:
        raise SystemExit("--n must be an even number of at least 2")

    assignments = ["baseline"] * (args.n // 2) + ["scopeproof"] * (args.n // 2)
    random.Random(args.seed).shuffle(assignments)
    base = args.base_url.rstrip("/") + "/"
    rows = []
    for index, condition in enumerate(assignments, start=1):
        participant = f"P{index:03d}"
        rows.append({
            "participant_id": participant,
            "condition": condition,
            "url": f"{base}?{urlencode({'condition': condition, 'participant': participant})}",
        })

    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["participant_id", "condition", "url"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} balanced links to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
