import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "test-artifacts");
const baseUrl = "http://127.0.0.1:4173";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(artifacts, { recursive: true });

const server = spawn("python3", ["-m", "http.server", "4173", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Keep waiting while the local server starts.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Local server did not start");
}

async function assertNoOverflow(page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(sizes.html <= sizes.viewport + 1, JSON.stringify(sizes));
  assert.ok(sizes.body <= sizes.viewport + 1, JSON.stringify(sizes));
}

async function startStudy(page) {
  const start = page.getByRole("button", { name: "练习答对后开始" });
  assert.equal(await start.isEnabled(), false);
  await page.getByRole("radio", { name: "资料与宣传不一致，说明宣传不对", exact: true }).check();
  await page.getByText("还不能说宣传不对", { exact: false }).waitFor();
  assert.equal(await start.isEnabled(), false);
  await page.getByRole("radio", { name: "资料还不够，现在不能支持商家的整句话", exact: true }).check();
  await page.getByText("答对了。资料只说明水壶能烧水", { exact: false }).waitFor();
  await page.getByRole("button", { name: "开始正式答题" }).click();
  await page.getByText("第 1 条，共 12 条", { exact: true }).waitFor();
}

async function answerOne(page) {
  await page.getByRole("radio", { name: "资料足够，能支持商家的整句话", exact: true }).check();
  await page.getByRole("radio", { name: "先请商家提供更多资料", exact: true }).check();
  const boxes = page.locator('#h3-set-choices input[type="checkbox"]');
  await boxes.first().check();
  // Two or more candidates make "which would you check first" informative: it is shown and
  // starts with nothing selected, so the participant has to choose.
  await boxes.nth(1).check();
  assert.equal(await page.locator("#priority-fieldset").isVisible(), true);
  assert.equal(await page.locator('#priority-choices input[type="radio"]').count(), 2);
  assert.equal(await page.locator('#priority-choices input[type="radio"]:checked').count(), 0);
  // A single candidate makes the answer forced, so the question hides and fills itself in
  // rather than demanding a meaningless click.
  await boxes.nth(1).uncheck();
  assert.equal(await page.locator("#priority-fieldset").isVisible(), false);
  assert.equal(await page.locator('#priority-choices input[type="radio"]:checked').count(), 1);
  await page.screenshot({ path: resolve(artifacts, "desktop-scopeproof-h3-v10.png"), fullPage: true });
  const save = page.getByRole("button", { name: "保存本题并继续" });
  assert.equal(await save.isEnabled(), false);
  await page.locator("#truth-slider").fill("70");
  assert.equal(await save.isEnabled(), false);
  await page.locator("#confidence-slider").fill("80");
  assert.equal(await save.isEnabled(), true);
  await save.click();
  await page.getByText("第 2 条，共 12 条", { exact: true }).waitFor();
}

await waitForServer();
const browser = await chromium.launch({ headless: true, executablePath: chrome });

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto(`${baseUrl}/?preview=1&condition=scopeproof&participant=TEST-S`);
  await desktop.getByRole("heading", { name: "请判断本页资料够不够支持商家的宣传" }).waitFor();
  assert.equal(await desktop.locator("body").evaluate((element) => getComputedStyle(element).fontSize), "18px");
  await desktop.getByRole("button", { name: "查看答题说明" }).click();
  assert.equal(await desktop.getByRole("dialog").isVisible(), true);
  await desktop.getByRole("button", { name: "关闭答题说明" }).click();
  await startStudy(desktop);
  assert.equal(await desktop.locator("#scopeproof-panel").isVisible(), true);
  assert.ok(await desktop.locator(".relation-label").count() >= 2);
  assert.equal(await desktop.getByText("左边", { exact: false }).count(), 0);
  assert.equal(await desktop.getByText("右边", { exact: false }).count(), 0);
  await answerOne(desktop);

  const localEvents = await desktop.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith("scopeproof-local-log:"));
    return JSON.parse(localStorage.getItem(key) || "[]");
  });
  const submit = localEvents.findLast((event) => event.event_type === "item_submit");
  assert.equal(submit.payload.truthProbabilityTouched, true);
  assert.equal(submit.payload.confidenceTouched, true);
  assert.equal(submit.payload.truthProbability, 70);
  assert.equal(submit.payload.confidence, 80);
  assert.equal(submit.payload.answerKeyVersion, "h3-set-v1.0");
  assert.equal(submit.payload.optionOrder.length, 4);
  assert.equal(submit.payload.selectedOptionIds.length, 1);
  assert.equal(submit.payload.eligiblePriorityOptionIds.length, 1);
  assert.equal(submit.payload.priorityOptionOrder.length, 1);
  assert.equal(submit.payload.responseTimeMs >= 0, true);
  await assertNoOverflow(desktop);
  assert.equal(await desktop.getByText("题目数量", { exact: true }).count(), 0);
  assert.equal(await desktop.getByText("参与编号", { exact: true }).count(), 0);
  await desktop.screenshot({ path: resolve(artifacts, "desktop-scopeproof-v10.png"), fullPage: true });

  const baseline = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await baseline.goto(`${baseUrl}/?preview=1&condition=baseline&participant=TEST-B`);
  await startStudy(baseline);
  assert.equal(await baseline.locator("#scopeproof-panel").isVisible(), false);
  assert.equal(await baseline.locator(".relation-label").count(), 0);
  const baselineBoxes = baseline.locator('#h3-set-choices input[type="checkbox"]');
  await baselineBoxes.first().check();
  assert.equal(await baseline.locator("#priority-fieldset").isVisible(), false);
  await baselineBoxes.nth(1).check();
  assert.equal(await baseline.locator("#priority-fieldset").isVisible(), true);
  await baseline.locator("#h3-none").check();
  assert.equal(await baseline.locator('#h3-set-choices input[type="checkbox"]:checked').count(), 0);
  assert.equal(await baseline.locator("#priority-fieldset").isVisible(), false);
  await assertNoOverflow(baseline);
  await baseline.screenshot({ path: resolve(artifacts, "desktop-baseline-v10.png"), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${baseUrl}/?preview=1&condition=scopeproof&participant=TEST-M`);
  await startStudy(mobile);
  await mobile.getByText("假设您正在替一个 20 人的团队挑选软件", { exact: false }).waitFor();
  await mobile.getByRole("heading", { name: "只根据本页资料判断" }).waitFor();
  assert.equal(await mobile.locator("#save-button").evaluate((element) => getComputedStyle(element).minHeight), "56px");
  await assertNoOverflow(mobile);
  await mobile.screenshot({ path: resolve(artifacts, "mobile-scopeproof-v10.png"), fullPage: true });

  const entry = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await entry.goto(`${baseUrl}/?preview=1`);
  await entry.getByRole("heading", { name: "请输入回响用户编号" }).waitFor();
  await entry.screenshot({ path: resolve(artifacts, "mobile-participant-entry-v10.png"), fullPage: true });
  await entry.getByLabel("回响用户编号").fill("TEST-ENTRY-V10");
  await entry.getByRole("button", { name: "下一步" }).click();
  await entry.getByRole("heading", { name: "请判断本页资料够不够支持商家的宣传" }).waitFor();
  await assertNoOverflow(entry);
  await entry.screenshot({ path: resolve(artifacts, "mobile-practice-v10.png"), fullPage: true });

  const previewCompletion = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const previewUrl = `${baseUrl}/?preview=1&condition=scopeproof&participant=TEST-COMPLETE-V10`;
  await previewCompletion.goto(previewUrl);
  await startStudy(previewCompletion);
  for (let index = 0; index < 12; index += 1) {
    await previewCompletion.getByRole("radio", { name: "资料还不够，现在不能支持商家的整句话", exact: true }).check();
    await previewCompletion.locator("#truth-slider").fill("50");
    await previewCompletion.locator("#confidence-slider").fill("70");
    await previewCompletion.getByRole("radio", { name: "先请商家提供更多资料", exact: true }).check();
    await previewCompletion.locator('#h3-set-choices input[type="checkbox"]').first().check();
    await previewCompletion.getByRole("button", { name: "保存本题并继续" }).click();
    if (index < 11) {
      await previewCompletion.getByText(`第 ${index + 2} 条，共 12 条`, { exact: true }).waitFor();
    }
  }
  await previewCompletion.getByRole("heading", { name: "预览已经完成" }).waitFor();
  assert.equal(await previewCompletion.getByRole("link", { name: "立即返回回响数据" }).isVisible(), false);
  assert.equal(await previewCompletion.locator("#completion-code").count(), 0);
  assert.equal(await previewCompletion.getByText("谢谢您的认真作答", { exact: true }).count(), 0);
  await previewCompletion.screenshot({ path: resolve(artifacts, "mobile-preview-completion-v10.png"), fullPage: true });
  await previewCompletion.waitForTimeout(1500);
  assert.equal(previewCompletion.url(), previewUrl);
  await assertNoOverflow(previewCompletion);

  const invalid = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await invalid.goto(`${baseUrl}/?participant=contains%20space`);
  await invalid.getByRole("heading", { name: "请输入回响用户编号" }).waitFor();
  assert.equal(await invalid.locator("#participant-error").isVisible(), true);

  console.log("PASS: v1.0 practice gate, participant entry, desktop, mobile, and preview completion");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
