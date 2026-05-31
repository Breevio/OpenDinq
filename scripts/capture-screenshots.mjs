import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const webUrl = process.env.OPENDINQ_WEB_URL ?? "http://localhost:3000";
const outputDir = new URL("../docs/screenshots/", import.meta.url);

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${webUrl}/generate`, { waitUntil: "networkidle" });
await page.screenshot({ path: new URL("generate.png", outputDir).pathname, fullPage: true });

await page.goto(`${webUrl}/discover`, { waitUntil: "networkidle" });
await page.getByLabel("Natural-language people search").fill("AI agent developers using TypeScript and MCP");
await page.getByRole("button", { name: "Search", exact: true }).click();
await page.waitForSelector(".result-card");
await page.screenshot({ path: new URL("discover.png", outputDir).pathname, fullPage: true });

await page.goto(`${webUrl}/u/demo-agent-builder`, { waitUntil: "networkidle" });
await page.waitForSelector(".profile-grid");
await page.screenshot({ path: new URL("profile.png", outputDir).pathname, fullPage: true });

await page.goto(`${webUrl}/u/demo-agent-builder/workspace`, { waitUntil: "networkidle" });
await page.waitForSelector(".workspace-grid");
await page.screenshot({ path: new URL("workspace.png", outputDir).pathname, fullPage: true });

await browser.close();

console.log("Captured screenshots in docs/screenshots");
