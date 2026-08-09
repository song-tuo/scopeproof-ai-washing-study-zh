import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.SCOPEPROOF_PRODUCTION_URL
  || "https://song-tuo.github.io/scopeproof-ai-washing-study-zh/";
const participant = `TEST-WEB-${Date.now()}`;
const url = `${baseUrl}?condition=scopeproof&participant=${participant}`;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ headless: true, executablePath: chrome });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url);
  await page.getByRole("heading", { name: "请帮我们判断人工智能产品的宣传资料" }).waitFor();
  await page.getByRole("button", { name: "我明白了，开始答题" }).click();
  await page.getByText("第 1 条，共 12 条", { exact: true }).waitFor({ timeoutMs: 20000 });

  for (let index = 0; index < 12; index += 1) {
    await page.getByRole("radio", { name: "现有资料还说不清", exact: true }).check();
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

  await page.getByRole("heading", { name: "谢谢您的认真作答" }).waitFor({ timeoutMs: 20000 });
  const completionCode = (await page.locator("#completion-code").textContent())?.trim() || "";
  assert.match(completionCode, /^\d{6}$/);
  assert.equal(await page.locator("#upload-warning").isVisible(), false);
  console.log("PASS: production GitHub Pages completed 12 items and received a cloud completion code");
} finally {
  await browser.close();
}
