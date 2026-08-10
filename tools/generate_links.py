#!/usr/bin/env python3
"""Generate balanced Huixiang participant URLs for ScopeProof v0.8."""

from __future__ import annotations

import argparse
import csv
import random
import re
from pathlib import Path
from urllib.parse import urlencode


PARTICIPANT_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


def read_participant_ids(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))
    values = [row[0].strip() for row in rows if row and row[0].strip()]
    if values and values[0].lower() in {"participant_id", "user_id", "id", "用户编号"}:
        values = values[1:]
    if len(values) != len(set(values)):
        raise SystemExit("Huixiang user IDs must be unique")
    invalid = [value for value in values if not PARTICIPANT_PATTERN.fullmatch(value)]
    if invalid:
        raise SystemExit(f"invalid Huixiang user ID: {invalid[0]}")
    return values


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=112)
    parser.add_argument(
        "--ids-file",
        type=Path,
        help="UTF-8 text/CSV whose first column contains Huixiang user IDs",
    )
    parser.add_argument(
        "--base-url",
        default="https://song-tuo.github.io/scopeproof-ai-washing-study-zh/",
    )
    parser.add_argument("--seed", type=int, default=20260810)
    parser.add_argument("--out", type=Path, default=Path("participant_links.csv"))
    args = parser.parse_args()

    participants = read_participant_ids(args.ids_file) if args.ids_file else [
        f"P{index:03d}" for index in range(1, args.n + 1)
    ]
    if len(participants) < 2 or len(participants) % 2:
        raise SystemExit("the number of participant IDs must be even and at least 2")

    assignments = ["baseline"] * (len(participants) // 2) + ["scopeproof"] * (len(participants) // 2)
    random.Random(args.seed).shuffle(assignments)
    base = args.base_url.rstrip("/") + "/"
    rows = []
    for participant, condition in zip(participants, assignments, strict=True):
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
