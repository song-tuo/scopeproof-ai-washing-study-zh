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
  await page.getByRole("button", { name: "我明白了，开始答题" }).click();
  await page.getByText("第 1 条，共 12 条", { exact: true }).waitFor();
}

async function answerOne(page) {
  await page.getByRole("radio", { name: "这些资料能说明这句话", exact: true }).check();
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
  await page.screenshot({ path: resolve(artifacts, "desktop-scopeproof-h3-v07.png"), fullPage: true });
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
  await desktop.getByRole("heading", { name: "请帮我们判断人工智能产品的宣传资料" }).waitFor();
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
  assert.equal(submit.payload.answerKeyVersion, "h3-set-v0.7");
  assert.equal(submit.payload.optionOrder.length, 4);
  assert.equal(submit.payload.selectedOptionIds.length, 1);
  assert.equal(submit.payload.eligiblePriorityOptionIds.length, 1);
  assert.equal(submit.payload.priorityOptionOrder.length, 1);
  assert.equal(submit.payload.responseTimeMs >= 0, true);
  await assertNoOverflow(desktop);
  await desktop.screenshot({ path: resolve(artifacts, "desktop-scopeproof-v07.png"), fullPage: true });

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
  await baseline.screenshot({ path: resolve(artifacts, "desktop-baseline-v07.png"), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${baseUrl}/?preview=1&condition=scopeproof&participant=TEST-M`);
  await startStudy(mobile);
  await mobile.getByText("假设您正在替一个 20 人的团队挑选软件", { exact: false }).waitFor();
  await mobile.getByRole("heading", { name: "只根据本页资料判断" }).waitFor();
  assert.equal(await mobile.locator("#save-button").evaluate((element) => getComputedStyle(element).minHeight), "56px");
  await assertNoOverflow(mobile);
  await mobile.screenshot({ path: resolve(artifacts, "mobile-scopeproof-v07.png"), fullPage: true });

  const invalid = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await invalid.goto(`${baseUrl}/?condition=baselien&participant=TEST-X`);
  await invalid.getByRole("heading", { name: "这个实验链接不完整" }).waitFor();

  console.log("PASS: desktop, baseline, mobile, two-step H3, large controls, required sliders, and strict links");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
