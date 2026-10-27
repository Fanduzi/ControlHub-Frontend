import { chromium } from "playwright";
import fs from "node:fs";

const email = fs.readFileSync(process.env.EMAIL_FILE, "utf8").trim();
const password = fs.readFileSync(process.env.PASS_FILE, "utf8").trim();
const base = process.env.BASE_URL;
const outPng = process.env.OUT_PNG;
const outTxt = process.env.OUT_TXT;

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  console.error("drive-login FAIL: Chromium missing — run: npx playwright install chromium");
  console.error(String(e));
  process.exit(1);
}

const page = await browser.newPage();
const lines = [];
try {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/overview/, { timeout: 30000 });
  await page.waitForSelector("h1", { timeout: 15000 });
  await page.screenshot({ path: outPng, fullPage: true });
  const url = page.url();
  const h1 = ((await page.locator("h1").first().textContent()) || "").trim();
  lines.push("ok=1", `url=${url}`, `h1=${h1}`, `screenshot=${outPng}`);
  fs.writeFileSync(outTxt, lines.join("\n") + "\n");
  console.log(`drive-login OK url=${url}`);
} catch (e) {
  lines.push("ok=0", `error=${String(e).split("\n")[0]}`);
  try {
    await page.screenshot({ path: outPng, fullPage: true });
  } catch (_) {}
  fs.writeFileSync(outTxt, lines.join("\n") + "\n");
  console.error("drive-login FAIL", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
