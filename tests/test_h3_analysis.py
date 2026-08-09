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
            "stimulus_set": "study12-zh-cn-v0.7",
            "item_id": "P-I-02",
            "position": "0",
            "truth_probability": "50",
            "confidence": "70",
            "action": "request-evidence",
            "h3_selected_ids": "{capability,metric_scope}",
            "h3_option_order": "{object,metric_scope,capability,condition}",
            "h3_slot_states": '{"capability":"non_covered","object":"covered","condition":"covered","metric_scope":"non_covered"}',
            "h3_answer_key_version": "h3-set-v0.7",
            "h3_explicit_none": "false",
            "priority_eligible_ids": "{capability,metric_scope}",
            "priority_selected_id": "metric_scope",
            "priority_option_order": "{metric_scope,capability}",
        }
        forced_row = {
            **row,
            "participant_id": "PILOT002",
            "item_id": "P-R-01",
            "h3_selected_ids": "{metric_scope}",
            "h3_slot_states": '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"non_covered"}',
            "priority_eligible_ids": "{metric_scope}",
            "priority_selected_id": "metric_scope",
            "priority_option_order": "{metric_scope}",
        }
        with source.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(row))
            writer.writeheader()
            writer.writerows([row, forced_row])
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
        with (output / "h3_priority_exploratory.csv").open(newline="", encoding="utf-8") as handle:
            priorities = list(csv.DictReader(handle))
        assert len(slots) == 8
        assert all(row["correct"] == "1" for row in slots)
        assert all(row["exact_set_accuracy"] == "1" for row in items)
        assert all(row["balanced_accuracy"] == "1.000000" for row in items)
        assert all(row["h3_slot_accuracy"] == "1.000000" for row in items)
        assert items[0]["epistemic_brier"] == "0.000000"
        assert items[0]["action_correct"] == "1"
        assert items[1]["epistemic_brier"] == "0.250000"
        assert items[1]["action_correct"] == "0"
        priority_by_participant = {row["participant_id"]: row for row in priorities}
        assert priority_by_participant["PILOT001"]["priority_forced"] == "0"
        assert priority_by_participant["PILOT001"]["has_priority_question"] == "1"
        assert priority_by_participant["PILOT002"]["priority_forced"] == "1"
        assert priority_by_participant["PILOT002"]["has_priority_question"] == "0"
    print("PASS: H3 analysis creates validated slot, item, priority, and participant tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
