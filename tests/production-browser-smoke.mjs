import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.SCOPEPROOF_PRODUCTION_URL
  || "https://song-tuo.github.io/scopeproof-ai-washing-study-zh/";
const participant = `TEST-WEB-${Date.now()}`;
const url = baseUrl;
const huixiangReturnUrl = "https://www.huixiangdata.com/transferPage?url=https%3A%2F%2Fwww.huixiangdata.com%2Fquestionnaire%2Fapi%2Fv1%2Fanswer%2Fthird%2Fcallback%2Fsubmit%2F202608136612";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ headless: true, executablePath: chrome });

async function completePractice(page) {
  for (let index = 0; index < 2; index += 1) {
    const claim = await page.locator("#practice-claim").textContent();
    const answer = claim.includes("电水壶")
      ? "资料还不够，现在不能支持商家的整句话"
      : "资料与宣传不一致，说明宣传不对";
    await page.getByRole("radio", { name: answer, exact: true }).check();
    await page.getByText("答对了", { exact: false }).waitFor();
    await page.getByRole("button", { name: index === 0 ? "继续下一道练习" : "查看练习小结" }).click();
  }
  await page.getByRole("heading", { name: "正式答题前，再看一遍" }).waitFor();
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let requestedReturnUrl = null;
  await page.route("https://www.huixiangdata.com/**", async (route) => {
    requestedReturnUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><h1>模拟回响接收页</h1></body></html>",
    });
  });
  await page.goto(url);
  await page.getByLabel("请填写已复制的回响数据用户ID，ID将仅用于审核数据匹配身份和发放报酬。").waitFor();
  await page.getByLabel("请填写已复制的回响数据用户ID，ID将仅用于审核数据匹配身份和发放报酬。").fill(participant);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("heading", { name: "请判断本页资料够不够支持商家的宣传" }).waitFor();
  await completePractice(page);
  await page.getByRole("button", { name: "开始正式答题" }).click();
  await page.getByText("第 1 条，共 12 条", { exact: true }).waitFor({ timeoutMs: 20000 });

  for (let index = 0; index < 12; index += 1) {
    await page.getByRole("radio", { name: "资料还不够，现在不能支持商家的整句话", exact: true }).check();
    await page.locator("#truth-slider").fill("50");
    await page.locator("#confidence-slider").fill("70");
    await page.getByRole("radio", { name: "先请商家提供更多资料", exact: true }).check();
    await page.locator('#h3-set-choices input[type="checkbox"]').first().check();
    await page.locator('#priority-choices input[type="radio"]').first().check();
    const save = page.getByRole("button", { name: "保存本题并继续" });
    assert.equal(await save.isEnabled(), true);
    await save.click();
    if (index < 11) {
      await page.getByText(`第 ${index + 2} 条，共 12 条`, { exact: true }).waitFor({ timeoutMs: 20000 });
    }
  }

  await page.getByRole("heading", { name: "回答已经保存" }).waitFor({ timeoutMs: 20000 });
  const returnLink = page.getByRole("link", { name: "立即返回回响数据" });
  assert.equal(await returnLink.isVisible(), true);
  assert.equal(await returnLink.getAttribute("href"), huixiangReturnUrl);
  assert.equal(await page.locator("#completion-code").count(), 0);
  assert.equal(await page.locator("#upload-warning").isVisible(), false);
  await page.waitForURL("https://www.huixiangdata.com/**", { timeout: 5000 });
  assert.equal(requestedReturnUrl, huixiangReturnUrl);
  console.log("PASS: production passed practice v1.1, saved 12 items, and auto-returned to Huixiang");
} finally {
  await browser.close();
}
