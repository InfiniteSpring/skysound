import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

/**
 * Next keeps visited pages (and, after a language switch, the other root layout) mounted but
 * hidden via React Activity; only the visible copy of a test id counts.
 */
const byId = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const objectName = (page: Page) => byId(page, "object-name");

const ctxState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __skysoundAudio?: () => string }).__skysoundAudio?.());

test("home renders in English by default", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Listen to the sky" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  // Compact home: one group of objects at a time.
  await expect(page.getByRole("link", { name: "Jupiter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Betelgeuse" })).toBeHidden();
  await page.getByRole("tab", { name: /Stars/ }).click();
  await expect(page.getByRole("link", { name: "Betelgeuse" })).toBeVisible();
  await expect(byId(page, "play-toggle")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/home.png" });
  expect(errors).toEqual([]);
});

test("Russian lives under /ru and /en redirects to the unprefixed URL", async ({ page, request }) => {
  await page.goto("/ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: "Послушайте небо" })).toBeVisible();
  await page.getByRole("tab", { name: /Звёзды/ }).click();
  await expect(page.getByRole("link", { name: "Бетельгейзе" })).toBeVisible();

  const res = await request.get("/en/object/sirius", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toMatch(/\/object\/sirius$/);
});

test("ten languages, including right-to-left Arabic and Urdu", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.getByRole("heading", { name: "聆听星空" })).toBeVisible();

  await page.goto("/ar/object/betelgeuse");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(objectName(page)).toHaveText("منكب الجوزاء");

  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(10);
  await page.getByRole("menuitem", { name: /हिन्दी/ }).click();
  await expect(page).toHaveURL(/\/hi$/);
  await expect(page.getByRole("heading", { name: "आकाश को सुनिए" })).toBeVisible();
});

test("object pages ship server-rendered HTML with localized meta tags and hreflang", async ({ request }) => {
  const en = await (await request.get("/object/delta-cephei")).text();
  expect(en).toContain("<title>Delta Cephei — variable star · Music of the Cosmos</title>");
  expect(en).toMatch(/<meta name="description" content="The prototype Cepheid/);
  expect(en).toContain('data-testid="object-name">Delta Cephei<');
  expect(en).toMatch(/<link rel="alternate" hrefLang="ru" href="[^"]*\/ru\/object\/delta-cephei"/);

  const ru = await (await request.get("/ru/object/delta-cephei")).text();
  expect(ru).toContain("<title>Дельта Цефея — переменная звезда · Музыка космоса</title>");
  expect(ru).toMatch(/<meta name="description" content="Прототип цефеид/);
});

test("selecting objects plays music that survives navigation, genre and language changes", async ({ page }) => {
  const errors = collectErrors(page);
  const toggle = byId(page, "play-toggle");

  await page.goto("/");
  // The click both unlocks audio and selects: the object starts playing on arrival.
  await page.getByRole("link", { name: "Jupiter" }).click();
  await expect(page).toHaveURL(/\/object\/jupiter$/);
  await expect(objectName(page)).toHaveText("Jupiter");
  await expect(toggle).toHaveAttribute("aria-label", "Pause", { timeout: 15_000 });
  await expect(page.getByText(/BPM/)).toBeVisible();
  expect(await ctxState(page)).toBe("running");

  // Pause, then explicitly pick another object: it plays, in the same AudioContext.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "Play");
  await page.getByRole("link", { name: "← Whole sky" }).click();
  await page.getByRole("tab", { name: /Stars/ }).click();
  await page.getByRole("link", { name: "Algol" }).click();
  await expect(page).toHaveURL(/\/object\/algol$/);
  await expect(toggle).toHaveAttribute("aria-label", "Pause", { timeout: 15_000 });
  await expect(byId(page, "now-playing")).toHaveText("Algol");

  // Genre switch crossfades without stopping.
  await page.getByRole("radio", { name: "Lo-fi" }).click();
  await expect(page.getByRole("radio", { name: "Lo-fi" })).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(1500);
  await expect(toggle).toHaveAttribute("aria-label", "Pause");

  // Switching language keeps the same music running and relabels it.
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: /Русский/ }).click();
  await expect(page).toHaveURL(/\/ru\/object\/algol$/);
  await expect(objectName(page)).toHaveText("Алголь");
  await expect(byId(page, "now-playing")).toHaveText("Алголь");
  await expect(byId(page, "play-toggle")).toHaveAttribute("aria-label", "Пауза");
  expect(await ctxState(page)).toBe("running");
  await page.screenshot({ path: "test-results/object.png" });
  expect(errors).toEqual([]);
});

test("a click on empty sky or Escape returns to the whole sky", async ({ page }) => {
  await page.goto("/object/sirius");
  await expect(objectName(page)).toHaveText("Sirius");
  await page.waitForLoadState("networkidle");
  // Dragging to look around must not navigate.
  await page.mouse.move(700, 200);
  await page.mouse.down();
  await page.mouse.move(800, 260, { steps: 5 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/object\/sirius$/);
  // A plain click on empty sky does.
  await page.mouse.click(1200, 140);
  await expect(page).toHaveURL(/localhost:3000\/$/);

  await page.goto("/ru/object/vega");
  await expect(objectName(page)).toHaveText("Вега");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/ru$/);
});

test("sound settings start collapsed and expand on demand", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const panel = byId(page, "settings-panel");
  const header = panel.getByRole("button", { name: /Sound settings/ });
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByText("Auto-switch objects")).toBeHidden();
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByText("Auto-switch objects")).toBeVisible();
  await header.click();
  await expect(panel.getByText("Auto-switch objects")).toBeHidden();
});

test("search finds stored objects in either language", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search for an object").fill("satur");
  await expect(page.getByRole("option").filter({ hasText: "Saturn" })).toBeVisible({ timeout: 15_000 });
  await page.goto("/ru");
  await page.getByLabel("Поиск объекта").fill("сатурн");
  await expect(page.getByRole("option").filter({ hasText: "Сатурн" })).toBeVisible({ timeout: 15_000 });
});

test("first sound starts quickly after a click", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const t0 = Date.now();
  await page.getByRole("link", { name: "Saturn" }).click();
  await expect(byId(page, "now-playing")).toHaveText("Saturn", { timeout: 5000 });
  expect(Date.now() - t0).toBeLessThan(2500);
});

test("Russian names are found in the catalogs via Wikidata (live network)", async ({ page }) => {
  await page.goto("/ru");
  await page.getByLabel("Поиск объекта").fill("Капелла");
  await expect(page.getByRole("option").filter({ hasText: "Капелла" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Из научных каталогов")).toBeVisible();
});

test("auto-switch moves to another object after the chosen time", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const panel = byId(page, "settings-panel");
  await panel.getByRole("button", { name: /Sound settings/ }).click();
  await panel.getByText("Auto-switch objects").click();
  await panel.getByRole("radio", { name: "1 min" }).click();
  await panel.getByRole("radio", { name: "In order" }).click();

  await page.getByRole("link", { name: "Sun", exact: true }).click();
  await expect(byId(page, "now-playing")).toHaveText("Sun", { timeout: 10_000 });
  await expect(byId(page, "switch-countdown")).toContainText("next in 0:");
  await expect(byId(page, "now-playing")).not.toHaveText("Sun", { timeout: 75_000 });
  await expect(page).not.toHaveURL(/\/object\/sun$/);
});
