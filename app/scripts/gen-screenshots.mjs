// Generates README screenshots at 1440x900 (light mode, EN) with PII masking.
// Usage: node scripts/gen-screenshots.mjs
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../docs/screenshots");
const BASE = process.env.BASE_URL || "http://localhost:3000";

const PAGES = [
  ["/", "landing.png"],
  ["/metrics", "copilot-usage.png"],
  ["/code-generation", "code-generation.png"],
  ["/pull-requests", "pr-autofix.png"],
  ["/agents", "agent-impact.png"],
  ["/cli", "cli-impact.png"],
  ["/seats", "copilot-licensing.png"],
  ["/premium-requests", "premium-requests.png"],
  ["/users", "users.png"],
  ["/enterprise-teams", "enterprise-teams.png"],
  ["/reference", "metrics-reference.png"],
  ["/settings", "settings.png"],
  ["/settings/data-sync", "data-sync.png"],
];

// Injected into every page: masks PII (logins ending in _shldc and their
// associated full names) deterministically, without touching UI labels.
function maskPII() {
  const PHON = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
    "xray", "yankee", "zulu",
  ];
  // Hide the Next.js dev-mode indicator badge so it doesn't overlap the footer.
  if (!document.getElementById("__screenshot_style")) {
    const style = document.createElement("style");
    style.id = "__screenshot_style";
    style.textContent =
      "nextjs-portal,[data-next-badge-root],[data-next-badge],[data-nextjs-toast],#__next-build-watcher{display:none !important;}";
    document.head.appendChild(style);
  }

  const map = (window.__maskMap = window.__maskMap || {});
  let next = Object.keys(map).length;
  const maskLogin = (login) => {
    if (!map[login]) {
      const p = PHON[next % PHON.length] + (next >= PHON.length ? Math.floor(next / PHON.length) : "");
      map[login] = p;
      next++;
    }
    return map[login];
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const nameLoginRe = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s[A-Za-zÀ-ÿ.'-]+)*)\s\((\w*_shldc)\)/g;
  const bareLoginRe = /\b\w*_shldc\b/g;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    let text = node.nodeValue;
    if (!text || !text.includes("_shldc")) continue;
    text = text.replace(nameLoginRe, (_m, _name, login) => {
      const p = maskLogin(login);
      return `User ${cap(p)} (user-${p})`;
    });
    text = text.replace(bareLoginRe, (login) => `user-${maskLogin(login)}`);
    node.nodeValue = text;
  }

  // Mask values inside inputs (e.g. enterprise slug, search fields) if they
  // contain a real login pattern.
  for (const el of document.querySelectorAll("input, textarea")) {
    if (el.value && el.value.includes("_shldc")) {
      el.value = el.value
        .replace(nameLoginRe, (_m, _name, login) => `user-${maskLogin(login)}`)
        .replace(bareLoginRe, (login) => `user-${maskLogin(login)}`);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("locale", "en");
    // Bypass the client-side gate overlays; data still requires the cookie.
    sessionStorage.setItem("admin_authenticated", "true");
    sessionStorage.setItem("dashboard_authenticated", "true");
  });
  const page = await context.newPage();

  // Authenticate for the admin-gated Settings pages so their data loads.
  // Provide the password via the SCREENSHOT_ADMIN_PASSWORD env var.
  const adminReq = await (await context.request.get(BASE + "/api/auth/verify-admin")).json().catch(() => ({}));
  if (adminReq && adminReq.required) {
    const pw = process.env.SCREENSHOT_ADMIN_PASSWORD;
    if (!pw) {
      console.warn("ADMIN_PASSWORD is set on the server but SCREENSHOT_ADMIN_PASSWORD was not provided \u2014 Settings data will not load.");
    } else {
      const res = await context.request.post(BASE + "/api/auth/verify-admin", {
        data: { password: pw },
        headers: { "Content-Type": "application/json" },
      });
      console.log(res.ok() ? "Admin authenticated." : "Admin authentication failed.");
    }
  }

  for (const [route, file] of PAGES) {
    const url = BASE + route;
    process.stdout.write(`-> ${route} ... `);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    // Let charts render / data fetch settle.
    await sleep(3500);
    await page.evaluate(maskPII);
    await sleep(300);
    await page.screenshot({ path: path.join(OUT_DIR, file) });
    console.log(file);
  }

  await browser.close();
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
