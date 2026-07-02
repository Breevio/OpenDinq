import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture console errors
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

// Navigate to discover page
await page.goto("http://localhost:3012/discover", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

// Type a search query
await page.fill('input[id="discover-query"]', "ai");
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

// Check if results are rendered
const resultCards = await page.locator('.result-card').count();
console.log(`Result cards: ${resultCards}`);

// Check if filter bar is rendered
const filterBar = await page.locator('.filter-bar').count();
console.log(`Filter bar: ${filterBar}`);

// Check filter toggle button
const filterToggle = await page.locator('.filter-toggle').count();
console.log(`Filter toggle button: ${filterToggle}`);

// Click filter toggle to expand
if (filterToggle > 0) {
  await page.click('.filter-toggle');
  await page.waitForTimeout(500);
  
  const filterPanel = await page.locator('.filter-panel').count();
  console.log(`Filter panel expanded: ${filterPanel}`);
  
  // Check filter groups
  const filterGroups = await page.locator('.filter-group').count();
  console.log(`Filter groups: ${filterGroups}`);
  
  // Check filter chips
  const filterChips = await page.locator('.filter-chip').count();
  console.log(`Filter chips: ${filterChips}`);
  
  // Click a location filter chip
  const chips = page.locator('.filter-chip');
  const chipTexts = [];
  for (let i = 0; i < Math.min(chips, 6); i++) {
    chipTexts.push(await chips.nth(i).textContent());
  }
  console.log(`Chip texts: ${JSON.stringify(chipTexts)}`);
}

// Check for errors
if (errors.length > 0) {
  console.log(`Console errors: ${JSON.stringify(errors)}`);
} else {
  console.log("No console errors");
}

await browser.close();
