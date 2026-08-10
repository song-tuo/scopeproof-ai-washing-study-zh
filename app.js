import { CLAIMS, STIMULUS_SET } from "./data/stimuli.js";

const config = window.SCOPEPROOF_CONFIG || {};
const params = new URLSearchParams(window.location.search);
const previewMode = params.get("preview") === "1";
const requestedCondition = params.get("condition");
const requestedParticipant = (params.get("participant") || "").trim();
const validConditions = new Set(["baseline", "scopeproof"]);
const participantPattern = /^[A-Za-z0-9_-]{1,40}$/;

let condition = validConditions.has(requestedCondition) ? requestedCondition : null;
let participantId = participantPattern.test(requestedParticipant) ? requestedParticipant : null;
const stimulusSet = config.stimulusSet || STIMULUS_SET;
const huixiangReturnUrl = isValidHuixiangReturnUrl(config.huixiangReturnUrl)
  ? config.huixiangReturnUrl
  : null;
let sessionStorageKey = participantId ? `scopeproof-session:${stimulusSet}:${participantId}` : "";
let localLogKey = participantId ? `scopeproof-local-log:${stimulusSet}:${participantId}` : "";

const $ = (selector) => document.querySelector(selector);
const screens = ["#entry-screen", "#fatal-screen", "#start-screen", "#study-screen", "#complete-screen"];

const statusMeta = {
  supported: {
    systemLabel: "本页资料：四个要点都有相应资料",
    summary: "四个要点都得到了本页资料的支持。",
  },
  refuted: {
    systemLabel: "本页资料：有一项结果与宣传不一致",
    summary: "四个要点都有相应资料，但其中一项的结果与宣传不一致。",
  },
  insufficient: {
    systemLabel: "本页资料：有些要点还缺少相应资料",
    summary: "本页资料只说到了部分要点，其他要点还没有找到相应资料。",
  },
};

const stateLabels = {
  covered: "已有相应资料",
  missing: "还缺资料",
  contradicted: "资料与宣传不一致",
};

const relationLabels = {
  supports: "这份资料与说法一致",
  contradicts: "这份资料与说法不一致",
  relevant: "这份资料有关，但不能单独说明",
};

const state = {
  sessionId: null,
  token: null,
  order: [],
  index: 0,
  completionCode: null,
  itemStartedAt: 0,
  truthTouched: false,
  confidenceTouched: false,
  evidenceOpenCount: 0,
  openEvidenceId: null,
  h3OptionOrder: [],
  priorityOptionOrder: [],
  priorityAutoFilled: false,
  saving: false,
  returnScheduled: false,
  practicePassed: false,
  practiceAttempts: 0,
};

function isValidHuixiangReturnUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const outer = new URL(value);
    const callback = new URL(outer.searchParams.get("url") || "");
    return outer.protocol === "https:"
      && outer.hostname === "www.huixiangdata.com"
      && outer.pathname === "/transferPage"
      && callback.protocol === "https:"
      && callback.hostname === "www.huixiangdata.com"
      && /^\/questionnaire\/api\/v1\/answer\/third\/callback\/submit\/\d+$/.test(callback.pathname);
  } catch {
    return false;
  }
}

function showOnly(selector) {
  screens.forEach((screen) => $(screen).classList.toggle("hidden", screen !== selector));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function setParticipantIdentity(value) {
  participantId = value;
  sessionStorageKey = `scopeproof-session:${stimulusSet}:${participantId}`;
  localLogKey = `scopeproof-local-log:${stimulusSet}:${participantId}`;
}

function previewConditionForParticipant(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? "baseline" : "scopeproof";
}

function randomToken(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (const character of seedText) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seedText) {
  const random = seededRandom(seedText);
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function appendLocalLog(entry) {
  if (!localLogKey) return;
  let current = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(localLogKey) || "[]");
    if (Array.isArray(parsed)) current = parsed;
  } catch {
    current = [];
  }
  localStorage.setItem(localLogKey, JSON.stringify([...current, entry]));
}

function createEvent(itemId, eventType, payload = {}) {
  const entry = {
    event_uuid: crypto.randomUUID(),
    session_id: state.sessionId,
    participant_id: participantId,
    condition,
    stimulus_set: stimulusSet,
    item_id: itemId,
    event_type: eventType,
    elapsed_ms: Math.max(0, Math.round(performance.now() - state.itemStartedAt)),
    payload,
    client_created_at: new Date().toISOString(),
  };
  appendLocalLog(entry);
  return entry;
}

async function rpc(name, body) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("云端数据服务还没有配置。请联系研究人员。");
  }
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
  if (!response.ok) {
    const rawMessage = String(payload?.message || "");
    if (/participant.*used|duplicate|unique/i.test(rawMessage)) {
      throw new Error("这个回响用户编号已经使用过。请联系研究人员。");
    }
    throw new Error("暂时无法连接云端。请检查网络后再试。");
  }
  return payload;
}

async function recordEvent(itemId, eventType, payload = {}) {
  const entry = createEvent(itemId, eventType, payload);
  if (previewMode || !state.sessionId) return true;
  try {
    await rpc("save_scopeproof_event", {
      p_session_id: state.sessionId,
      p_token: state.token,
      p_event_uuid: entry.event_uuid,
      p_item_id: itemId,
      p_event_type: eventType,
      p_elapsed_ms: entry.elapsed_ms,
      p_payload: payload,
      p_client_created_at: entry.client_created_at,
    });
    return true;
  } catch {
    $("#upload-warning").classList.remove("hidden");
    return false;
  }
}

function storedSession() {
  if (!sessionStorageKey) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(sessionStorageKey) || "null");
    if (
      stored?.sessionId
      && stored?.token
      && (!condition || stored?.condition === condition)
      && stored?.stimulusSet === stimulusSet
    ) return stored;
  } catch {
    return null;
  }
  return null;
}

function persistSession() {
  if (!sessionStorageKey) return;
  localStorage.setItem(sessionStorageKey, JSON.stringify({
    sessionId: state.sessionId,
    token: state.token,
    condition,
    stimulusSet,
    order: state.order,
  }));
}

function applySession(payload, token) {
  if (!payload || payload.stimulus_set !== stimulusSet || (condition && payload.condition !== condition)) {
    throw new Error("保存的进度属于另一个实验版本，请联系研究人员。");
  }
  condition = payload.condition;
  state.sessionId = payload.session_id;
  state.token = token;
  state.order = payload.item_order;
  state.index = payload.current_position;
  state.completionCode = payload.completion_code || null;
  persistSession();
}

async function startSession() {
  const button = $("#start-button");
  const error = $("#start-error");
  if (!state.practicePassed) {
    error.textContent = "请先完成上面的练习题。";
    error.classList.remove("hidden");
    return;
  }
  button.disabled = true;
  button.textContent = "正在连接，请稍候";
  error.classList.add("hidden");

  try {
    const saved = storedSession();
    if (previewMode) {
      if (!condition) condition = previewConditionForParticipant(participantId);
      state.sessionId = `preview-${participantId}`;
      state.token = "preview";
      state.order = shuffled(CLAIMS.map((item) => item.id), participantId);
      state.index = 0;
    } else if (saved) {
      const payload = await rpc("get_scopeproof_session", {
        p_session_id: saved.sessionId,
        p_token: saved.token,
      });
      applySession(payload, saved.token);
    } else {
      const token = randomToken();
      const order = shuffled(CLAIMS.map((item) => item.id), participantId);
      const payload = await rpc("create_scopeproof_session", {
        p_token: token,
        p_participant_id: participantId,
        p_condition: condition,
        p_stimulus_set: stimulusSet,
        p_item_order: order,
        p_user_agent: navigator.userAgent.slice(0, 400),
        p_viewport_width: window.innerWidth,
        p_viewport_height: window.innerHeight,
      });
      applySession(payload, token);
      createEvent(order[0], "session_start", {
        item_order: order,
        raw_query: window.location.search,
        viewport: [window.innerWidth, window.innerHeight],
      });
    }

    if (state.index >= CLAIMS.length) {
      renderCompletion();
    } else {
      renderCurrentItem();
      showOnly("#study-screen");
    }
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : "暂时无法开始，请稍后再试。";
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = state.practicePassed ? "开始正式答题" : "练习答对后开始";
  }
}

function currentItem() {
  const id = state.order[state.index];
  return CLAIMS.find((item) => item.id === id);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSlots(item) {
  const panel = $("#scopeproof-panel");
  panel.classList.toggle("hidden", condition !== "scopeproof");
  const grid = $("#slot-grid");
  grid.replaceChildren();
  if (condition !== "scopeproof") return;

  item.slots.forEach((slot) => {
    const wrapper = createElement("article", `slot-item ${slot.state}`);
    wrapper.append(
      createElement("span", "slot-state", stateLabels[slot.state]),
      createElement("strong", "", slot.label),
      createElement("p", "", slot.value),
    );
    grid.append(wrapper);
  });

  // Contradicted evidence does not count as support.
  const supported = item.slots.filter((slot) => slot.state === "covered").length;
  $("#coverage-score").textContent = `${supported}/4`;
}

function renderEvidence(item) {
  const list = $("#evidence-list");
  list.replaceChildren();
  state.evidenceOpenCount = 0;
  state.openEvidenceId = null;

  item.evidence.forEach((evidence, index) => {
    const details = createElement("details", "evidence-card");
    details.dataset.evidenceId = evidence.id;
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.append(
      createElement("small", "evidence-meta", `${evidence.kind} · 资料 ${evidence.id}`),
      createElement("strong", "", evidence.source),
    );
    summary.append(title);
    if (condition === "scopeproof") {
      summary.append(createElement("span", `relation-label ${evidence.relation}`, relationLabels[evidence.relation]));
    }
    const body = createElement("div", "evidence-body");
    body.append(createElement("p", "", evidence.text));
    details.append(summary, body);

    details.addEventListener("toggle", () => {
      if (details.open) {
        list.querySelectorAll("details[open]").forEach((other) => {
          if (other !== details) other.open = false;
        });
        state.openEvidenceId = evidence.id;
        state.evidenceOpenCount += 1;
        details.dataset.wasOpened = "1";
        void recordEvent(item.id, "evidence_open", { evidence_id: evidence.id });
      } else if (details.dataset.wasOpened === "1") {
        if (state.openEvidenceId === evidence.id) state.openEvidenceId = null;
        void recordEvent(item.id, "evidence_close", { evidence_id: evidence.id });
      }
    });
    list.append(details);
    if (index === 0) details.open = true;
  });
}

function optionLabel(option, item) {
  const slot = item.slots.find((candidate) => candidate.id === option.id);
  const wrapper = document.createElement("span");
  wrapper.append(
    createElement("strong", "", slot?.label || "要点"),
    document.createTextNode(option.text),
  );
  return wrapper;
}

function renderH3Options(item) {
  const container = $("#h3-set-choices");
  container.replaceChildren();
  const ordered = shuffled(item.options, `${participantId}:${item.id}:h3-options`);
  state.h3OptionOrder = ordered.map((option) => option.id);
  ordered.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "h3-slot";
    input.value = option.id;
    input.addEventListener("change", () => {
      if (input.checked) $("#h3-none").checked = false;
      updatePriorityOptions(item);
      updateSubmitState();
    });
    label.append(input, optionLabel(option, item));
    container.append(label);
  });
}

function selectedH3Ids() {
  return [...document.querySelectorAll('input[name="h3-slot"]:checked')]
    .map((input) => input.value);
}

function updatePriorityOptions(item) {
  const selectedIds = selectedH3Ids();
  const fieldset = $("#priority-fieldset");
  const container = $("#priority-choices");
  const previous = document.querySelector('input[name="priority"]:checked')?.value || null;

  if (selectedIds.length === 0) {
    state.priorityOptionOrder = [];
    container.replaceChildren();
    fieldset.classList.add("hidden");
    return;
  }

  const selectedOptions = item.options.filter((option) => selectedIds.includes(option.id));
  const ordered = shuffled(selectedOptions, `${participantId}:${item.id}:priority:${selectedIds.slice().sort().join("-")}`);
  state.priorityOptionOrder = ordered.map((option) => option.id);
  container.replaceChildren();
  // A one-candidate priority is forced and identifiable downstream from the eligible set.
  const forced = ordered.length === 1;
  // Do not carry an auto-filled value into a real choice.
  const carried = state.priorityAutoFilled ? null : previous;
  ordered.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "priority";
    input.value = option.id;
    input.checked = forced || option.id === carried;
    input.addEventListener("change", updateSubmitState);
    label.append(input, optionLabel(option, item));
    container.append(label);
  });
  state.priorityAutoFilled = forced;
  fieldset.classList.toggle("hidden", forced);
}

function resetResponse() {
  $("#response-form").reset();
  state.truthTouched = false;
  state.confidenceTouched = false;
  state.priorityOptionOrder = [];
  state.priorityAutoFilled = false;
  state.saving = false;
  for (const sliderName of ["truth", "confidence"]) {
    const slider = $(`#${sliderName}-slider`);
    slider.value = "50";
    slider.classList.add("untouched");
    $(`#${sliderName}-output`).textContent = "尚未选择";
    $(`#${sliderName}-prompt`).classList.remove("hidden");
  }
  $("#priority-choices").replaceChildren();
  $("#priority-fieldset").classList.add("hidden");
  $("#response-error").classList.add("hidden");
  updateSubmitState();
}

function renderCurrentItem() {
  const item = currentItem();
  if (!item) throw new Error("找不到当前题目。");
  state.itemStartedAt = performance.now();
  state.openEvidenceId = null;

  $("#progress-text").textContent = `第 ${state.index + 1} 条，共 ${CLAIMS.length} 条`;
  $("#progress-fill").style.width = `${((state.index + 1) / CLAIMS.length) * 100}%`;
  $("#product-name").textContent = item.product;
  $("#claim-type").textContent = item.type === "performance" ? "产品效果说法" : "自动工作说法";
  $("#claim-text").textContent = item.claim;
  $("#evidence-count").textContent = `共 ${item.evidence.length} 份`;

  const status = $("#system-status");
  status.className = `status-banner ${item.status}`;
  status.textContent = statusMeta[item.status].systemLabel;

  const supported = item.slots.filter((slot) => slot.state === "covered").length;
  const contradicted = item.slots.filter((slot) => slot.state === "contradicted").length;
  const missing = item.slots.filter((slot) => slot.state === "missing").length;
  $("#status-summary").textContent = contradicted > 0
    ? `四个要点中，有 ${supported} 项得到本页资料支持；另有 ${contradicted} 项的结果与宣传不一致。`
    : missing > 0
      ? `四个要点中，有 ${supported} 项得到本页资料支持；另有 ${missing} 项还没有找到相应资料。`
      : statusMeta[item.status].summary;

  renderSlots(item);
  renderEvidence(item);
  renderH3Options(item);
  resetResponse();
}

function responseValues() {
  const form = new FormData($("#response-form"));
  const item = currentItem();
  const selectedOptionIds = form.getAll("h3-slot");
  return {
    status: form.get("status"),
    truthProbability: Number($("#truth-slider").value),
    truthProbabilityTouched: state.truthTouched,
    confidence: Number($("#confidence-slider").value),
    confidenceTouched: state.confidenceTouched,
    action: form.get("action"),
    selectedOptionIds,
    optionOrder: [...state.h3OptionOrder],
    slotStates: Object.fromEntries(item.slots.map((slot) => [
      slot.id,
      slot.state === "covered" ? "covered" : "non_covered",
    ])),
    answerKeyVersion: "h3-set-v1.0",
    h3ExplicitNone: form.get("h3-none") === "none",
    eligiblePriorityOptionIds: [...selectedOptionIds],
    selectedPriorityOptionId: form.get("priority"),
    priorityOptionOrder: [...state.priorityOptionOrder],
  };
}

function updateSubmitState() {
  const values = responseValues();
  const h3Answered = values.h3ExplicitNone !== (values.selectedOptionIds.length > 0);
  const priorityAnswered = values.selectedOptionIds.length === 0 || Boolean(values.selectedPriorityOptionId);
  const complete = Boolean(
    values.status
    && values.action
    && h3Answered
    && priorityAnswered
    && values.truthProbabilityTouched
    && values.confidenceTouched
  );
  $("#save-button").disabled = !complete || state.saving;
}

async function submitResponse(event) {
  event.preventDefault();
  const values = responseValues();
  const h3Answered = values.h3ExplicitNone !== (values.selectedOptionIds.length > 0);
  const priorityAnswered = values.selectedOptionIds.length === 0 || Boolean(values.selectedPriorityOptionId);
  if (!values.status || !values.action || !h3Answered || !priorityAnswered || !values.truthProbabilityTouched || !values.confidenceTouched) {
    $("#response-error").textContent = "请把五组问题全部答完。";
    $("#response-error").classList.remove("hidden");
    return;
  }

  const item = currentItem();
  const button = $("#save-button");
  state.saving = true;
  button.disabled = true;
  button.textContent = "正在保存";
  $("#response-error").classList.add("hidden");

  if (state.openEvidenceId) {
    await recordEvent(item.id, "evidence_close", { evidence_id: state.openEvidenceId, automatic: true });
    state.openEvidenceId = null;
  }

  const responseMs = Math.max(0, Math.round(performance.now() - state.itemStartedAt));
  const localEntry = createEvent(item.id, "item_submit", { ...values, responseTimeMs: responseMs });

  try {
    let result;
    if (previewMode) {
      const nextPosition = state.index + 1;
      result = {
        current_position: nextPosition,
        status: nextPosition >= CLAIMS.length ? "complete" : "active",
        completion_code: nextPosition >= CLAIMS.length ? "PREVIEW" : null,
      };
    } else {
      result = await rpc("save_scopeproof_response", {
        p_session_id: state.sessionId,
        p_token: state.token,
        p_item_id: item.id,
        p_position: state.index,
        p_response_status: values.status,
        p_truth_probability: values.truthProbability,
        p_truth_touched: values.truthProbabilityTouched,
        p_confidence: values.confidence,
        p_confidence_touched: values.confidenceTouched,
        p_action: values.action,
        p_h3_selected_ids: values.selectedOptionIds,
        p_h3_option_order: values.optionOrder,
        p_h3_explicit_none: values.h3ExplicitNone,
        p_priority_eligible_ids: values.eligiblePriorityOptionIds,
        p_priority_selected_id: values.selectedPriorityOptionId,
        p_priority_option_order: values.priorityOptionOrder,
        p_response_ms: responseMs,
        p_evidence_open_count: state.evidenceOpenCount,
        p_event_uuid: localEntry.event_uuid,
        p_client_created_at: localEntry.client_created_at,
      });
    }

    $("#upload-warning").classList.add("hidden");
    state.index = result.current_position;
    state.completionCode = result.completion_code || null;
    if (result.status === "complete" || state.index >= CLAIMS.length) {
      renderCompletion();
    } else {
      renderCurrentItem();
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  } catch (caught) {
    $("#upload-warning").classList.remove("hidden");
    $("#response-error").textContent = caught instanceof Error
      ? `${caught.message} 这一题仍保存在本机，请不要关闭页面。`
      : "保存失败，请检查网络后再试。";
    $("#response-error").classList.remove("hidden");
  } finally {
    state.saving = false;
    button.textContent = "保存本题并继续";
    updateSubmitState();
  }
}

function renderCompletion() {
  const kicker = $("#completion-kicker");
  const title = $("#completion-title");
  const message = $("#completion-message");
  const platformReturn = $("#huixiang-return");
  const note = $("#completion-note");
  const warning = $("#completion-warning");
  const download = $("#download-button");
  const hasLocalLog = Boolean(localStorage.getItem(localLogKey));

  warning.classList.add("hidden");
  download.classList.add("hidden");
  platformReturn.classList.add("hidden");
  note.classList.add("hidden");

  if (previewMode) {
    kicker.textContent = "预览结束";
    title.textContent = "预览已经完成";
    message.textContent = "这是预览模式，没有保存数据，也不会返回回响数据。";
    if (hasLocalLog && params.get("researcher") === "1") download.classList.remove("hidden");
  } else if (!state.completionCode) {
    kicker.textContent = "需要确认";
    title.textContent = "保存还没有确认";
    message.textContent = "请先不要关闭页面，并联系研究人员。";
    warning.textContent = "云端完成状态尚未确认。请下载本机记录并联系研究人员。";
    warning.classList.remove("hidden");
    download.classList.remove("hidden");
  } else {
    kicker.textContent = "正在返回";
    title.textContent = "回答已经保存";
    message.textContent = "页面正在返回回响数据，请稍候。";
    platformReturn.href = huixiangReturnUrl;
    platformReturn.classList.remove("hidden");
    note.classList.remove("hidden");
    if (hasLocalLog && params.get("researcher") === "1") download.classList.remove("hidden");
  }

  showOnly("#complete-screen");

  if (!previewMode && state.completionCode && !state.returnScheduled) {
    state.returnScheduled = true;
    window.setTimeout(() => window.location.replace(huixiangReturnUrl), 1200);
  }
}

function downloadLocalLog() {
  const payload = localStorage.getItem(localLogKey) || "[]";
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scopeproof-${participantId}-${condition}-${stimulusSet}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function initialize() {
  if (stimulusSet !== STIMULUS_SET) {
    $("#fatal-message").textContent = "网页设置与题目版本不一致，请联系研究人员。";
    showOnly("#fatal-screen");
    return;
  }
  if (!previewMode && (!config.supabaseUrl || !config.supabaseAnonKey)) {
    $("#fatal-message").textContent = "云端数据服务尚未配置，请联系研究人员。";
    showOnly("#fatal-screen");
    return;
  }
  if (!previewMode && !huixiangReturnUrl) {
    $("#fatal-message").textContent = "回响数据返回地址尚未配置，请联系研究人员。";
    showOnly("#fatal-screen");
    return;
  }
  if (!participantId) {
    if (requestedParticipant) {
      $("#participant-error").textContent = "这个用户编号格式不正确。请完整填写，编号中不要使用空格。";
      $("#participant-error").classList.remove("hidden");
    }
    showOnly("#entry-screen");
    return;
  }
  showOnly("#start-screen");
}

$("#participant-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("#participant-input").value.trim();
  const error = $("#participant-error");
  if (!participantPattern.test(value)) {
    error.textContent = "请完整填写回响用户编号。编号中不能有空格。";
    error.classList.remove("hidden");
    return;
  }
  error.classList.add("hidden");
  setParticipantIdentity(value);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("participant", value);
  window.history.replaceState(null, "", nextUrl);
  showOnly("#start-screen");
});
document.querySelectorAll('input[name="practice"]').forEach((input) => {
  input.addEventListener("change", (event) => {
    const feedback = $("#practice-feedback");
    const button = $("#start-button");
    state.practiceAttempts += 1;
    state.practicePassed = event.target.value === "insufficient";
    feedback.classList.toggle("correct", state.practicePassed);
    feedback.classList.toggle("incorrect", !state.practicePassed);
    if (state.practicePassed) {
      feedback.textContent = "答对了。资料只说明水壶能烧水，没有说明 3 分钟和 1 升水，所以现在只能说资料还不够。";
      button.disabled = false;
      button.textContent = "开始正式答题";
      $("#start-error").classList.add("hidden");
    } else {
      feedback.textContent = event.target.value === "refuted"
        ? "还不能说宣传不对。现有资料没有反驳它，只是缺少 3 分钟和 1 升水的测试。请再选一次。"
        : "说明书只证明水壶能烧水，没有证明 3 分钟和 1 升水。资料还不足以支持整句话，请再选一次。";
      button.disabled = true;
      button.textContent = "练习答对后开始";
    }
  });
});
$("#start-button").addEventListener("click", startSession);
$("#response-form").addEventListener("submit", submitResponse);
$("#response-form").addEventListener("change", updateSubmitState);
$("#h3-none").addEventListener("change", (event) => {
  if (event.target.checked) {
    document.querySelectorAll('input[name="h3-slot"]').forEach((input) => { input.checked = false; });
  }
  updatePriorityOptions(currentItem());
  updateSubmitState();
});
$("#truth-slider").addEventListener("input", (event) => {
  state.truthTouched = true;
  event.target.classList.remove("untouched");
  $("#truth-output").textContent = `${event.target.value}%`;
  $("#truth-prompt").classList.add("hidden");
  updateSubmitState();
});
$("#confidence-slider").addEventListener("input", (event) => {
  state.confidenceTouched = true;
  event.target.classList.remove("untouched");
  $("#confidence-output").textContent = `${event.target.value}%`;
  $("#confidence-prompt").classList.add("hidden");
  updateSubmitState();
});
$("#help-button").addEventListener("click", () => {
  $("#help-dialog").showModal();
  const item = currentItem();
  if (item && state.sessionId) void recordEvent(item.id, "help_open");
});
$("#help-close").addEventListener("click", () => $("#help-dialog").close());
$("#help-dialog").addEventListener("close", () => {
  const item = currentItem();
  if (item && state.sessionId) void recordEvent(item.id, "help_close");
});
$("#help-dialog").addEventListener("click", (event) => {
  if (event.target === $("#help-dialog")) $("#help-dialog").close();
});
$("#download-button").addEventListener("click", downloadLocalLog);

initialize();
