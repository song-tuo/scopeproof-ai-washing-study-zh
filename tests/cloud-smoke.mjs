import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CLAIMS, STIMULUS_SET } from "../data/stimuli.js";

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL("../config.js", import.meta.url), "utf8"), sandbox);
const config = sandbox.window.SCOPEPROOF_CONFIG;
assert.equal(config.stimulusSet, STIMULUS_SET);

async function rpc(name, body) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.ok, true, `${name}: ${JSON.stringify(payload)}`);
  return payload;
}

const directRead = await fetch(`${config.supabaseUrl}/rest/v1/scopeproof_sessions?select=*`, {
  headers: {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
  },
});
assert.equal(directRead.ok, false, "Anonymous users must not read study tables directly");

const participant = `TEST-CLOUD-${Date.now()}`;
const token = randomBytes(32).toString("hex");
const order = CLAIMS.map((claim) => claim.id);
const session = await rpc("create_scopeproof_session", {
  p_token: token,
  p_participant_id: participant,
  p_condition: "scopeproof",
  p_stimulus_set: STIMULUS_SET,
  p_item_order: order,
  p_user_agent: "ScopeProof cloud smoke test",
  p_viewport_width: 1440,
  p_viewport_height: 1000,
});

await rpc("save_scopeproof_event", {
  p_session_id: session.session_id,
  p_token: token,
  p_event_uuid: randomUUID(),
  p_item_id: order[0],
  p_event_type: "evidence_open",
  p_elapsed_ms: 100,
  p_payload: { evidence_id: "E1" },
  p_client_created_at: new Date().toISOString(),
});

let result = null;
for (let position = 0; position < order.length; position += 1) {
  const item = CLAIMS.find((claim) => claim.id === order[position]);
  const selected = item.slots.filter((slot) => slot.state !== "covered").map((slot) => slot.id);
  const optionOrder = item.options.map((option) => option.id);
  result = await rpc("save_scopeproof_response", {
    p_session_id: session.session_id,
    p_token: token,
    p_item_id: order[position],
    p_position: position,
    p_response_status: "insufficient",
    p_truth_probability: 50,
    p_truth_touched: true,
    p_confidence: 70,
    p_confidence_touched: true,
    p_action: "request-evidence",
    p_h3_selected_ids: selected,
    p_h3_option_order: optionOrder,
    p_h3_explicit_none: selected.length === 0,
    p_priority_eligible_ids: selected,
    p_priority_selected_id: selected[0] || null,
    p_priority_option_order: selected,
    p_response_ms: 5000,
    p_evidence_open_count: 1,
    p_event_uuid: randomUUID(),
    p_client_created_at: new Date().toISOString(),
  });
}

assert.equal(result.current_position, 12);
assert.equal(result.status, "complete");
assert.match(result.completion_code, /^\d{6}$/);

const resumed = await rpc("get_scopeproof_session", {
  p_session_id: session.session_id,
  p_token: token,
});
assert.equal(resumed.current_position, 12);
assert.equal(resumed.status, "complete");
assert.equal(resumed.completion_code, result.completion_code);

console.log("PASS: v0.8 set-valued H3 completed 12 cloud items; direct table read remained blocked");
