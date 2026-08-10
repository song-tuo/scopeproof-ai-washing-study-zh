#!/usr/bin/env python3
"""Convert a v1.0 response export into preregistered H3 analysis tables."""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


SLOTS = ("capability", "object", "condition", "metric_scope")
STIMULUS_SET = "study12-zh-cn-v1.0"
ANSWER_KEY_VERSION = "h3-set-v1.0"
ITEM_STATUS = {
    "P-S-01": "supported",
    "P-S-04": "supported",
    "A-S-01": "supported",
    "P-R-01": "refuted",
    "A-R-02": "refuted",
    "A-R-03": "refuted",
    "P-I-01": "insufficient",
    "P-I-02": "insufficient",
    "A-I-01": "insufficient",
    "P-F-01": "insufficient",
    "A-F-01": "insufficient",
    "A-F-02": "insufficient",
}
EPISTEMIC_TARGET = {"supported": 1.0, "refuted": 0.0, "insufficient": 0.5}
CORRECT_ACTION = {
    "supported": "rely-on-claim",
    "refuted": "discount-claim",
    "insufficient": "request-evidence",
}


def parse_array(raw: str | None) -> list[str]:
    value = (raw or "").strip()
    if not value or value == "{}":
        return []
    if value.startswith("["):
        parsed = json.loads(value)
        if not isinstance(parsed, list):
            raise ValueError(f"Expected an array, got: {value}")
        return [str(item) for item in parsed]
    if value.startswith("{") and value.endswith("}"):
        value = value[1:-1]
        if not value:
            return []
        return [item.strip().strip('"') for item in value.split(",")]
    raise ValueError(f"Cannot parse array: {value}")


def parse_bool(raw: str | None) -> bool:
    value = (raw or "").strip().lower()
    if value in {"true", "t", "1", "yes"}:
        return True
    if value in {"false", "f", "0", "no"}:
        return False
    raise ValueError(f"Cannot parse boolean: {raw}")


def safe_rate(numerator: int, denominator: int) -> str:
    return "" if denominator == 0 else f"{numerator / denominator:.6f}"


def balanced_rate(tp: int, fn: int, tn: int, fp: int) -> str:
    if tp + fn == 0 or tn + fp == 0:
        return ""
    return f"{((tp / (tp + fn)) + (tn / (tn + fp))) / 2:.6f}"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def prepare(input_path: Path, output_dir: Path, exclude_prefixes: tuple[str, ...], allow_incomplete: bool) -> None:
    with input_path.open(newline="", encoding="utf-8-sig") as handle:
        source_rows = list(csv.DictReader(handle))
    if not source_rows:
        raise ValueError("The export contains no rows")

    slot_rows: list[dict] = []
    item_rows: list[dict] = []
    priority_rows: list[dict] = []
    participant_items: dict[str, set[str]] = defaultdict(set)
    seen: set[tuple[str, str]] = set()

    for row_number, row in enumerate(source_rows, start=2):
        participant = (row.get("participant_id") or "").strip()
        if not participant:
            raise ValueError(f"Row {row_number}: participant_id is required")
        if participant.startswith(exclude_prefixes):
            continue
        if row.get("stimulus_set", STIMULUS_SET) != STIMULUS_SET:
            continue
        if row.get("session_status") and row["session_status"] != "complete":
            raise ValueError(f"Row {row_number}: participant session is not complete")
        if row.get("h3_answer_key_version", ANSWER_KEY_VERSION) != ANSWER_KEY_VERSION:
            raise ValueError(f"Row {row_number}: wrong H3 answer-key version")

        item_id = (row.get("item_id") or "").strip()
        if item_id not in ITEM_STATUS:
            raise ValueError(f"Row {row_number}: unknown item_id {item_id!r}")
        key = (participant, item_id)
        if key in seen:
            raise ValueError(f"Row {row_number}: duplicate participant/item response {key}")
        seen.add(key)
        participant_items[participant].add(item_id)

        condition = (row.get("condition") or "").strip()
        if condition not in {"baseline", "scopeproof"}:
            raise ValueError(f"Row {row_number}: invalid condition")
        truth_probability = int(row.get("truth_probability", -1))
        confidence = int(row.get("confidence", -1))
        action = (row.get("action") or "").strip()
        if not 0 <= truth_probability <= 100 or not 0 <= confidence <= 100:
            raise ValueError(f"Row {row_number}: invalid probability or confidence")
        if action not in {"rely-on-claim", "request-evidence", "discount-claim"}:
            raise ValueError(f"Row {row_number}: invalid action")
        selected = parse_array(row.get("h3_selected_ids"))
        option_order = parse_array(row.get("h3_option_order"))
        priority_eligible = parse_array(row.get("priority_eligible_ids"))
        priority_order = parse_array(row.get("priority_option_order"))
        explicit_none = parse_bool(row.get("h3_explicit_none"))
        priority_selected = (row.get("priority_selected_id") or "").strip()
        try:
            slot_states = json.loads(row.get("h3_slot_states") or "{}")
        except json.JSONDecodeError as error:
            raise ValueError(f"Row {row_number}: invalid h3_slot_states JSON") from error

        if len(option_order) != 4 or set(option_order) != set(SLOTS):
            raise ValueError(f"Row {row_number}: h3_option_order must contain each slot once")
        if len(selected) != len(set(selected)) or not set(selected).issubset(SLOTS):
            raise ValueError(f"Row {row_number}: invalid selected set")
        if set(slot_states) != set(SLOTS) or not set(slot_states.values()).issubset({"covered", "non_covered"}):
            raise ValueError(f"Row {row_number}: invalid slot states")
        if explicit_none != (len(selected) == 0):
            raise ValueError(f"Row {row_number}: explicit-none response conflicts with selected set")
        if set(priority_eligible) != set(selected) or set(priority_order) != set(selected):
            raise ValueError(f"Row {row_number}: priority candidates conflict with selected set")
        if selected and priority_selected not in selected:
            raise ValueError(f"Row {row_number}: invalid priority selection")
        if not selected and priority_selected:
            raise ValueError(f"Row {row_number}: empty H3 set cannot have a priority selection")

        actual = {slot for slot in SLOTS if slot_states[slot] == "non_covered"}
        selected_set = set(selected)
        tp = len(actual & selected_set)
        fp = len(selected_set - actual)
        fn = len(actual - selected_set)
        tn = len(set(SLOTS) - actual - selected_set)
        trial_order = int(row.get("position", 0)) + 1
        verdict_type = ITEM_STATUS[item_id]
        epistemic_brier = ((truth_probability / 100) - EPISTEMIC_TARGET[verdict_type]) ** 2
        common = {
            "participant_id": participant,
            "condition": condition,
            "item_id": item_id,
            "trial_order": trial_order,
            "claim_type": "performance" if item_id.startswith("P-") else "automation",
            "verdict_type": verdict_type,
        }

        for slot in SLOTS:
            actual_noncovered = int(slot in actual)
            selected_as_noncovered = int(slot in selected_set)
            slot_rows.append({
                **common,
                "slot_type": slot,
                "option_position": option_order.index(slot) + 1,
                "actual_noncovered": actual_noncovered,
                "selected_as_noncovered": selected_as_noncovered,
                "correct": int(actual_noncovered == selected_as_noncovered),
            })

        item_rows.append({
            **common,
            "selected_ids": "|".join(selected),
            "actual_noncovered_ids": "|".join(slot for slot in SLOTS if slot in actual),
            "exact_set_accuracy": int(selected_set == actual),
            "h3_slot_accuracy": f"{(tp + tn) / 4:.6f}",
            "truth_probability": truth_probability,
            "confidence": confidence,
            "epistemic_brier": f"{epistemic_brier:.6f}",
            "action": action,
            "action_correct": int(action == CORRECT_ACTION[verdict_type]),
            "tp": tp,
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "sensitivity": safe_rate(tp, tp + fn),
            "specificity": safe_rate(tn, tn + fp),
            "balanced_accuracy": balanced_rate(tp, fn, tn, fp),
        })

        # With a single eligible slot the priority answer is forced, not chosen: the interface
        # fills it in without asking. Such rows must stay out of the exploratory priority
        # distribution, so they are flagged rather than silently pooled.
        priority_forced = len(selected) == 1
        priority_rows.append({
            **common,
            "eligible_priority_ids": "|".join(priority_eligible),
            "selected_priority_id": priority_selected,
            "priority_option_order": "|".join(priority_order),
            "has_priority_question": int(len(selected) >= 2),
            "priority_forced": int(priority_forced),
        })

    if not slot_rows:
        raise ValueError("No eligible v1.0 responses remained after filtering")
    if not allow_incomplete:
        incomplete = {participant: len(items) for participant, items in participant_items.items() if len(items) != 12}
        if incomplete:
            raise ValueError(f"Incomplete participants found: {incomplete}")

    summaries: list[dict] = []
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in item_rows:
        grouped[row["participant_id"]].append(row)
    for participant, rows in sorted(grouped.items()):
        tp = sum(row["tp"] for row in rows)
        tn = sum(row["tn"] for row in rows)
        fp = sum(row["fp"] for row in rows)
        fn = sum(row["fn"] for row in rows)
        summaries.append({
            "participant_id": participant,
            "condition": rows[0]["condition"],
            "item_count": len(rows),
            "slot_decision_count": len(rows) * 4,
            "exact_set_accuracy": f"{sum(row['exact_set_accuracy'] for row in rows) / len(rows):.6f}",
            "mean_h3_slot_accuracy": f"{sum(float(row['h3_slot_accuracy']) for row in rows) / len(rows):.6f}",
            "mean_epistemic_brier": f"{sum(float(row['epistemic_brier']) for row in rows) / len(rows):.6f}",
            "action_accuracy": f"{sum(row['action_correct'] for row in rows) / len(rows):.6f}",
            "sensitivity": safe_rate(tp, tp + fn),
            "specificity": safe_rate(tn, tn + fp),
            "balanced_accuracy": balanced_rate(tp, fn, tn, fp),
        })

    write_csv(output_dir / "h3_slot_level.csv", list(slot_rows[0]), slot_rows)
    write_csv(output_dir / "h3_item_level.csv", list(item_rows[0]), item_rows)
    write_csv(output_dir / "h3_priority_exploratory.csv", list(priority_rows[0]), priority_rows)
    write_csv(output_dir / "h3_participant_summary.csv", list(summaries[0]), summaries)
    print(f"wrote {len(slot_rows)} slot decisions from {len(item_rows)} item responses to {output_dir}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="CSV exported with the query in RESEARCHER_GUIDE_ZH.md")
    parser.add_argument("--out", type=Path, default=Path("private/h3_analysis"))
    parser.add_argument("--exclude-prefix", default="TEST,REVIEW,PROBE")
    parser.add_argument("--allow-incomplete", action="store_true")
    args = parser.parse_args()
    prefixes = tuple(part.strip() for part in args.exclude_prefix.split(",") if part.strip())
    prepare(args.input, args.out, prefixes, args.allow_incomplete)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
