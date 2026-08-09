#!/usr/bin/env python3
"""Smoke-test the deterministic H3 analysis preparation."""

from __future__ import annotations

import csv
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        source = folder / "export.csv"
        output = folder / "analysis"
        row = {
            "participant_id": "PILOT001",
            "condition": "scopeproof",
            "stimulus_set": "study12-zh-cn-v0.6",
            "item_id": "P-I-02",
            "position": "0",
            "h3_selected_ids": "{capability,metric_scope}",
            "h3_option_order": "{object,metric_scope,capability,condition}",
            "h3_slot_states": '{"capability":"non_covered","object":"covered","condition":"covered","metric_scope":"non_covered"}',
            "h3_answer_key_version": "h3-set-v0.6",
            "h3_explicit_none": "false",
            "priority_eligible_ids": "{capability,metric_scope}",
            "priority_selected_id": "metric_scope",
            "priority_option_order": "{metric_scope,capability}",
        }
        with source.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(row)
        subprocess.run(
            ["python3", "tools/prepare_h3_analysis.py", str(source), "--out", str(output), "--allow-incomplete"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        with (output / "h3_slot_level.csv").open(newline="", encoding="utf-8") as handle:
            slots = list(csv.DictReader(handle))
        with (output / "h3_item_level.csv").open(newline="", encoding="utf-8") as handle:
            items = list(csv.DictReader(handle))
        assert len(slots) == 4
        assert all(row["correct"] == "1" for row in slots)
        assert items[0]["exact_set_accuracy"] == "1"
        assert items[0]["balanced_accuracy"] == "1.000000"
    print("PASS: H3 analysis creates validated slot, item, priority, and participant tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
