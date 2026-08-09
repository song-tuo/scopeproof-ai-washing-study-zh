#!/usr/bin/env python3
"""Static research, language, security, and accessibility checks."""

from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_stimuli() -> tuple[str, list[dict]]:
    script = (
        "import('./data/stimuli.js').then(m=>"
        "console.log(JSON.stringify({version:m.STIMULUS_SET,claims:m.CLAIMS})))"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    return payload["version"], payload["claims"]


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def main() -> int:
    version, claims = load_stimuli()
    assert version == "study12-zh-cn-v0.6"
    assert len(claims) == 12
    assert len({claim["id"] for claim in claims}) == 12
    assert Counter(claim["status"] for claim in claims) == {
        "supported": 3,
        "refuted": 3,
        "insufficient": 6,
    }
    assert Counter(claim["type"] for claim in claims) == {
        "performance": 6,
        "automation": 6,
    }

    forbidden_keys = {"gold", "goldCounterfactual", "claim_truth", "truth", "gold_action"}
    assert not (forbidden_keys & set(walk_keys(claims)))
    for claim in claims:
        assert len(claim["slots"]) == 4
        assert {slot["id"] for slot in claim["slots"]} == {
            "capability", "object", "condition", "metric_scope"
        }
        assert len(claim["evidence"]) >= 2
        assert {option["id"] for option in claim["options"]} == {
            "capability", "object", "condition", "metric_scope"
        }
        assert all(len(evidence["text"]) >= 20 for evidence in claim["evidence"])

    participant_text = "\n".join([
        (ROOT / "index.html").read_text(encoding="utf-8"),
        (ROOT / "data/stimuli.js").read_text(encoding="utf-8"),
    ])
    for term in (
        "Counterfactual", "Coverage", "claim slot", "RAG", "可执行的系统",
        "连接工具", "证据充分性", "左边", "右边",
    ):
        assert term not in participant_text, term

    public_files = [
        ROOT / "index.html",
        ROOT / "styles.css",
        ROOT / "app.js",
        ROOT / "data/stimuli.js",
        ROOT / "config.example.js",
    ]
    public_source = "\n".join(path.read_text(encoding="utf-8") for path in public_files)
    assert "goldCounterfactual" not in public_source
    assert "claim_truth" not in public_source

    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert "font-size: 18px" in css
    assert "min-height: 56px" in css
    assert "min-height: 54px" in css
    assert "@media (max-width: 680px)" in css
    assert "1.5px solid" in css
    assert "letter-spacing: 0" in css

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'lang="zh-CN"' in html
    assert 'name="viewport"' in html
    assert "只根据本页资料判断" in html
    assert "不要猜商家手里" in html
    assert "尚未选择" in html
    assert 'id="h3-set-choices"' in html
    assert 'type="checkbox" name="h3-none"' in html
    assert 'id="priority-fieldset"' in html

    app = (ROOT / "app.js").read_text(encoding="utf-8")
    assert 'answerKeyVersion: "h3-set-v0.6"' in app
    assert "selectedOptionIds" in app
    assert "priorityOptionOrder" in app

    sql = (ROOT / "supabase/schema.sql").read_text(encoding="utf-8")
    assert sql.count("enable row level security") == 3
    assert "revoke all on public.scopeproof_sessions from anon, authenticated" in sql
    assert "grant execute on function public.create_scopeproof_session" in sql
    assert "truth_touched boolean not null check (truth_touched)" in sql
    assert "confidence_touched boolean not null check (confidence_touched)" in sql
    assert "h3_selected_ids text[]" in sql
    assert "h3_slot_states jsonb" in sql
    assert "h3-set-v0.6" in sql
    assert "invalid H3 option order" in sql
    assert not re.search(r"grant\s+(select|insert|update|delete).*scopeproof_", sql, re.I)

    migration = (ROOT / "supabase/migrations/20260810040000_h3_set_measurement_v06.sql").read_text(encoding="utf-8")
    server_states = {
        item_id: json.loads(raw)
        for item_id, raw in re.findall(r"when '([^']+)' then '(\{[^']+\})'::jsonb", migration)
    }
    assert len(server_states) == 12
    for claim in claims:
        expected = {
            slot["id"]: "covered" if slot["state"] == "covered" else "non_covered"
            for slot in claim["slots"]
        }
        assert server_states[claim["id"]] == expected

    print("PASS: 12-item contract, natural-language gate, no gold leakage, responsive and RLS checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
