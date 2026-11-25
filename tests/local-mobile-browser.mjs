// Visual/interaction smoke test at phone width. Does not claim to emulate iOS installed mode.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const modules = process.env.ARSHJUL_TEST_MODULES || resolve(root, "node_modules");
const { chromium } = require(resolve(modules, "playwright-core"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  if (path === "/supabase-config.js") {
    response.writeHead(200, { "content-type": "text/javascript" });
    response.end("window.ARSHJUL_CONFIG={};");
    return;
  }
  const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(`${root}/`)) { response.writeHead(403); response.end(); return; }
  try {
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(8765, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.ARSHJUL_CHROME_BIN ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => ({
    screenWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    headerTop: document.querySelector("h1").getBoundingClientRect().top,
    installVisible: getComputedStyle(document.querySelector("#installHelp")).display !== "none",
    viewportFit: document.querySelector('meta[name="viewport"]').content.includes("viewport-fit=cover"),
    icon: document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"),
    manifest: document.querySelector('link[rel="manifest"]').getAttribute("href")
  }));
  assert.ok(metrics.documentWidth <= metrics.screenWidth, "phone width must not scroll horizontally");
  assert.ok(metrics.headerTop >= 16, "heading must have top inset");
  assert.ok(metrics.installVisible && metrics.viewportFit && metrics.icon && metrics.manifest);
  await page.locator("#installHelp summary").click();
  assert.match(await page.locator("#installHelp").innerText(), /Safari.*Chrome/s);
  const manifestResponse = await page.request.get("http://127.0.0.1:8765/manifest.webmanifest");
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  for (const file of ["icon-180.png", "icon-192.png", "icon-512.png", "arshjulet.svg"]) {
    assert.equal((await page.request.get(`http://127.0.0.1:8765/icons/${file}`)).status(), 200);
  }
  assert.deepEqual(errors, []);
  console.log("PASS phone-width layout, install instructions, manifest and icon delivery");

  // Exercise the actual app controls in a simulated standalone context.
  const installed = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await installed.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true });
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async (payload) => { window.__otpSend = payload; return { error: null }; },
      verifyOtp: async (payload) => { window.__otpVerify = payload;
        return { data: { session: null }, error: { code: "invalid_otp" } }; }
    } }) };
  });
  const installedPage = await installed.newPage();
  await installedPage.route("**/supabase-config.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'window.ARSHJUL_CONFIG={supabaseUrl:"http://127.0.0.1:54321",supabasePublishableKey:"test-public-key"};'
  }));
  await installedPage.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle" });
  await installedPage.locator("#authPanel").waitFor({ state: "visible" });
  assert.match(await installedPage.locator("#authSummary").innerText(), /Hemskärmsappen/);
  assert.equal(await installedPage.locator("#installHelp").isVisible(), false);
  await installedPage.locator("#authEmail").fill("member@example.invalid");
  await installedPage.locator("#magicLinkBtn").click();
  await installedPage.locator("#otpForm").waitFor({ state: "visible" });
  const sent = await installedPage.evaluate(() => window.__otpSend);
  assert.equal(sent.options.shouldCreateUser, false);
  await installedPage.locator("#otpCode").fill("123456");
  await installedPage.locator("#verifyCodeBtn").click();
  await installedPage.waitForFunction(() => Boolean(window.__otpVerify));
  const verified = await installedPage.evaluate(() => window.__otpVerify);
  assert.deepEqual(verified, { email: "member@example.invalid", token: "123456", type: "email" });
  await installed.close();
  console.log("PASS standalone sign-in guidance and email-code controls");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
