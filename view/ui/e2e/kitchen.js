// the end-to-end harness (t1): each test gets a kitchen, a fresh database
// seeded from the terminal and its own server, and drives the real app in a
// browser. what it checks is the server's state, read back with `poki op`:
// a restyle doesn't break a test, a lost write does. `just e2e` builds the
// binary (POKI_BIN) and runs these; `just check` doesn't.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import { chromium, firefox } from "playwright-core";

const BIN = process.env.POKI_BIN;
if (!BIN) throw new Error("POKI_BIN is the poki binary to test (just e2e builds it)");

// today as the browser sees it: the plan opens on it
export const today = new Date().toLocaleDateString("en-CA");

// the seed: the same small kitchen as the manual checks, through the terminal
const seed = [
  ...["Fruit & veg", "Dairy", "Bakery", "Pantry"].map((g) => ["group", "add", g]),
  ["item", "add", "Tomatoes", "--unit", "count", "--group", "Fruit & veg"],
  ["item", "add", "Spinach", "--unit", "g", "--group", "Fruit & veg"],
  ["item", "add", "Lettuce", "--unit", "count", "--group", "Fruit & veg"],
  ["item", "add", "Mozzarella", "--unit", "g", "--group", "Dairy"],
  ["item", "add", "Bread", "--unit", "count", "--group", "Bakery"],
  ["item", "add", "Lasagna sheets", "--unit", "g", "--group", "Pantry"],
  ["item", "add", "Ground beef", "--unit", "g"],
  ["item", "add", "Olive oil"],
  ...["Lasagna", "Green salad", "Lamb curry", "Omelette"].map((m) => ["meal", "add", m]),
  ["meal", "ingredient", "add", "Lasagna", "Lasagna sheets", "250"],
  ["meal", "ingredient", "add", "Lasagna", "Mozzarella", "200"],
  ["meal", "ingredient", "add", "Lasagna", "Tomatoes", "6"],
  ["meal", "ingredient", "add", "Lasagna", "Ground beef", "500"],
  ["meal", "ingredient", "add", "Lasagna", "Olive oil"],
  ["meal", "ingredient", "add", "Green salad", "Lettuce", "1"],
  ["plan", "add", today, "lunch", "Lasagna"],
  ["plan", "add", today, "lunch", "Green salad"],
  ["plan", "add", today, "dinner", "--no-meal"],
  ["list", "add", "Spinach", "300"],
  ["list", "add", "Bread", "2"],
];

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

// kitchen starts a seeded server: url, op (a `poki op` command's output), stop.
export async function kitchen() {
  const dir = mkdtempSync(join(tmpdir(), "poki-e2e-"));
  const env = { ...process.env, POKI_DB: join(dir, "poki.db") };
  const op = (...args) => execFileSync(BIN, ["op", ...args], { env, encoding: "utf8" });
  execFileSync(BIN, ["migrate"], { env });
  for (const s of seed) op(...s);
  const port = await freePort();
  env.POKI_ADDR = `127.0.0.1:${port}`;
  const server = spawn(BIN, ["run", "--dev"], { env, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url + "/healthz")).ok) break;
    } catch {}
    if (i > 100) throw new Error("the server didn't come up");
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    url,
    op,
    stop() {
      server.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// the browsers: the newest of each installed for playwright (its own revision
// for 1.64.1 is newer than this machine has; these run with it). webkit
// doesn't launch on this machine: the iphone is checked by hand.
const cache = join(homedir(), ".cache", "ms-playwright");
const newest = (prefix, rel) => {
  const dirs = readdirSync(cache).filter((d) => d.startsWith(prefix + "-")).sort();
  if (!dirs.length) throw new Error(`no ${prefix} in ${cache}`);
  return join(cache, dirs.at(-1), rel);
};
export const engines = {
  chromium: () => chromium.launch({ executablePath: process.env.POKI_CHROMIUM || newest("chromium", "chrome-linux64/chrome") }),
  firefox: () => firefox.launch({ executablePath: process.env.POKI_FIREFOX || newest("firefox", "firefox/firefox") }),
};

// open is the app at phone width (or desktop), once it has synced the kitchen.
export async function open(browser, url, { desktop = false } = {}) {
  const context = await browser.newContext({ viewport: desktop ? { width: 1600, height: 900 } : { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(url);
  await synced(page);
  return page;
}

// synced waits until the phone has sent everything and the server took it.
export async function synced(page) {
  await page.waitForTimeout(300); // a tap's write reaches the outbox a moment later
  await page.waitForFunction(() => {
    const s = window.poki?.syncer.state;
    return s && s.status === "synced" && !s.syncing && window.poki.data.all("meals").length > 0;
  }, null, { timeout: 15000 });
}

// the tap helpers: by visible text, or by the label a button carries
export const tap = (page, text) => page.getByText(text, { exact: true }).first().click();
export const press = (page, label) => page.getByLabel(label, { exact: true }).first().click();

// type waits for the field that just opened to take the focus (it does so a
// moment after it appears), then types; replace types over what it holds.
export async function type(page, text, { replace = false } = {}) {
  await page.locator("input:focus").waitFor();
  if (replace) await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}
