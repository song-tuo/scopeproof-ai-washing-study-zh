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
    assert version == "study12-zh-cn-v1.0"
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

    # H3 option wording must not tell participants which slots are unsupported. Two guards:
    # (1) no rhetorical intensifier or interrogative form may vary with slot state, and
    # (2) no single short substring may separate supported from unsupported options well
    #     enough to beat reading the page, either overall or within one slot type.
    options = [
        {
            "slot": option["id"],
            "state": next(s["state"] for s in claim["slots"] if s["id"] == option["id"]),
            "text": option["text"],
        }
        for claim in claims
        for option in claim["options"]
    ]
    assert len(options) == 48
    for banned in ("真的", "确实", "果真", "究竟", "到底", "哪些", "是不是"):
        assert not any(banned in option["text"] for option in options), banned
    # A single uniform interrogative form removes question form as a state cue.
    assert all("是否" in option["text"] for option in options)

    def balanced_accuracy(rows: list[dict], cue: str) -> float:
        pos = [row for row in rows if row["state"] != "covered"]
        neg = [row for row in rows if row["state"] == "covered"]
        if not pos or not neg:
            return 0.5
        sens = sum(cue in row["text"] for row in pos) / len(pos)
        spec = sum(cue not in row["text"] for row in neg) / len(neg)
        # A cue is equally usable inverted, so score the better of the two readings.
        return max(0.5 * (sens + spec), 0.5 * ((1 - sens) + (1 - spec)))

    def substrings(rows: list[dict], min_hits: int) -> set[str]:
        found = set()
        for row in rows:
            plain = re.sub(r"[，。？?、\s]", "", row["text"])
            for size in (2, 3, 4):
                for start in range(len(plain) - size + 1):
                    found.add(plain[start:start + size])
        return {
            cue for cue in found
            if min_hits <= sum(cue in row["text"] for row in rows) <= len(rows) - min_hits
        }

    # Ceilings, not proofs. Options must name specific evidence, so wording correlates with slot
    # identity and with what each slot actually says; that residue is real and is handled in the
    # model by slot_type and item random intercepts. These bounds only catch a cue strong enough
    # to beat reading the page (the best state-blind structural strategy scores about 0.70).
    # Current worst values: 0.68 overall, 0.78 within a slot. The banned-word and uniform-form
    # rules above, not these bounds, are the primary guard against a "真的"-class regression.
    for cue in substrings(options, 4):
        score = balanced_accuracy(options, cue)
        assert score <= 0.70, f"overall wording cue {cue!r} reaches balanced accuracy {score:.2f}"
    for slot in ("capability", "object", "condition", "metric_scope"):
        rows = [option for option in options if option["slot"] == slot]
        for cue in substrings(rows, 3):
            score = balanced_accuracy(rows, cue)
            assert score <= 0.85, f"{slot} wording cue {cue!r} reaches balanced accuracy {score:.2f}"

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
    assert 'styles.css?v=1.1.4' in html
    assert 'config.js?v=1.1.4' in html
    assert 'app.js?v=1.1.4' in html
    assert "只根据本页资料判断" in html
    assert "我们不问商家是不是故意说谎" in html
    assert "尚未选择" in html
    assert 'id="practice-box" class="practice-box"' in html
    assert 'id="practice-choices"' in html
    assert 'id="practice-summary"' in html
    assert "同样条件下，测试结果与宣传相反" in html
    assert 'id="start-button" class="primary-button" type="button" disabled' in html
    assert 'id="h3-set-choices"' in html
    assert 'type="checkbox" name="h3-none"' in html
    assert 'id="priority-fieldset"' in html
    assert 'id="entry-screen"' in html
    assert 'id="participant-input"' in html
    assert "请填写已复制的回响数据用户ID，ID将仅用于审核数据匹配身份和发放报酬。" in html
    assert "请输入回响用户编号" not in html
    assert "这个实验链接不完整" not in html
    assert 'id="huixiang-return"' in html
    assert "202608102142" in html
    assert 'id="completion-code"' not in html
    assert 'class="session-facts"' not in html
    for removed_text in ("题目数量", "大约用时", "参与编号", "全部完成", "谢谢您的认真作答", "12 条题目已经保存"):
        assert removed_text not in html, removed_text

    app = (ROOT / "app.js").read_text(encoding="utf-8")
    assert 'answerKeyVersion: "h3-set-v1.0"' in app
    assert "selectedOptionIds" in app
    assert "priorityOptionOrder" in app
    assert "window.location.replace(huixiangReturnUrl)" in app
    assert "isValidHuixiangReturnUrl" in app
    assert "setParticipantIdentity" in app
    assert 'const PRACTICE_VERSION = "practice-v1.1"' in app
    assert 'p_practice_summary: practiceSummary()' in app
    assert '}, { retries: 2 });' in app
    assert "state.pendingToken || randomToken()" in app
    assert "p_viewport_height: Math.max(240, window.innerHeight)" in app
    assert "错误 ${response.status}" in app
    assert 'if (!config.supabaseAnonKey.startsWith("sb_publishable_"))' in app
    assert "headers: supabaseHeaders()" in app
    assert 'id: "insufficient"' in app
    assert 'id: "refuted"' in app
    assert '["localhost", "127.0.0.1", "::1", "[::1]"]' in app

    h3_doc = (ROOT / "H3_MEASUREMENT_V10_ZH.md").read_text(encoding="utf-8")
    assert "H3 是确认性的过程/操纵指标，不是因果中介" in h3_doc
    assert "不报告间接效应" in h3_doc
    assert "同一屏" not in h3_doc
    assert "只能部分控制" in h3_doc

    guide = (ROOT / "RESEARCHER_GUIDE_ZH.md").read_text(encoding="utf-8")
    assert "12–16 人软启动" in guide
    assert "96 名有效完成者" in guide
    assert "practice-v1.1" in guide
    assert "总尝试次数 >= 4" in guide
    assert "练习总用时 < 8 秒" in guide

    sql = (ROOT / "supabase/schema.sql").read_text(encoding="utf-8")
    assert sql.count("enable row level security") == 3
    assert "revoke all on public.scopeproof_sessions from anon, authenticated" in sql
    assert "grant execute on function public.create_scopeproof_session" in sql
    assert "truth_touched boolean not null check (truth_touched)" in sql
    assert "confidence_touched boolean not null check (confidence_touched)" in sql
    assert "h3_selected_ids text[]" in sql
    assert "h3_slot_states jsonb" in sql
    assert "h3-set-v1.0" in sql
    assert "pg_advisory_xact_lock(202608101200)" in sql
    assert "invalid H3 option order" in sql
    assert "invalid practice summary" in sql
    assert "invalid practice first-try flag" in sql
    assert "practice_summary" in sql
    assert not re.search(r"grant\s+(select|insert|update|delete).*scopeproof_", sql, re.I)

    practice_migration = (ROOT / "supabase/migrations/20260810140000_v11_practice_summary.sql").read_text(encoding="utf-8")
    assert "drop function public.create_scopeproof_session" in practice_migration
    assert "practice-v1.1" in practice_migration
    assert "jsonb_object_keys(p_practice_summary)" in practice_migration
    assert "practice_summary', p_practice_summary" in practice_migration

    retry_migration = (ROOT / "supabase/migrations/20260811020000_v12_idempotent_session_retry.sql").read_text(encoding="utf-8")
    assert "create or replace function public.create_scopeproof_session" in retry_migration
    assert "token_hash = extensions.digest(p_token, 'sha256')" in retry_migration
    assert "participant already used" in retry_migration

    migration = (ROOT / "supabase/migrations/20260810120000_v10_comprehension_practice.sql").read_text(encoding="utf-8")
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

    print("PASS: v1.0 stimuli, practice v1.1, natural-language gate, responsive and RLS checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
