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

/** Turn settings on before the app reads them (they live in localStorage). */
const withSettings = (page: Page, settings: Record<string, unknown>) =>
  page.addInitScript((s) => localStorage.setItem("skysound:audio-settings", JSON.stringify(s)), settings);

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

  await withSettings(page, { homeShowsTrack: false }); // this test browses the object list mid-play
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
  await withSettings(page, { zoomOnSelect: true }); // zoomed in, the corner of the view is guaranteed empty sky
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
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  await page.goto("/ru/object/vega");
  await expect(objectName(page)).toHaveText("Вега");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/ru$/);
});

test("selecting an object zooms the telescope into its animated close-up; leaving fades it out", async ({ page }) => {
  const errors = collectErrors(page);
  const closeUp = () =>
    page.evaluate(() => (window as unknown as { __skysoundCloseUp?: () => { kind: string; fade: number } }).__skysoundCloseUp?.());

  await withSettings(page, { zoomOnSelect: true, homeShowsTrack: false });
  await page.goto("/object/sgr-a-star");
  await expect(objectName(page)).toHaveText("Sagittarius A*");
  await expect.poll(async () => (await closeUp())?.kind, { timeout: 10_000 }).toBe("black_hole");
  await expect.poll(async () => (await closeUp())?.fade ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.95);

  // Scrolling out works even right after arriving (the flight hands zoom to the user).
  await page.mouse.move(800, 360);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 400);

  // Leaving for the whole sky fades the close-up away.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect.poll(async () => (await closeUp())?.fade ?? 0, { timeout: 10_000 }).toBeLessThan(0.05);

  // Black holes get their own tab on the home page.
  await page.getByRole("tab", { name: /Black holes/ }).click();
  await expect(page.getByRole("link", { name: "M87*" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("clicking the zoomed object keeps it selected; clicking empty sky goes home", async ({ page }) => {
  const errors = collectErrors(page);
  const closeUp = () =>
    page.evaluate(() => (window as unknown as { __skysoundCloseUp?: () => { slug: string; fade: number } }).__skysoundCloseUp?.());

  await withSettings(page, { zoomOnSelect: true });
  await page.goto("/object/saturn");
  await expect.poll(async () => (await closeUp())?.fade ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.95);

  // The subject sits right of centre (shifted clear of the info panel).
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const shift = w > 900 ? Math.min(0.17 * w, 260) : 0;
  await page.mouse.click(w / 2 + shift, h / 2);
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/object\/saturn$/);

  await page.mouse.click(w - 40, h * 0.3);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  expect(errors).toEqual([]);
});

test("about slides up over the sky and closes without leaving the object", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/object/vega");
  const sheet = page.getByTestId("about-sheet");
  await expect(sheet).toBeHidden();
  await page.getByTestId("about-toggle").click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "mikita.loverau.main@gmail.com" })).toHaveAttribute("href", "mailto:mikita.loverau.main@gmail.com");
  await expect(sheet.getByRole("link", { name: "@UemDiHaskl" })).toHaveAttribute("href", "https://t.me/UemDiHaskl");
  await expect(sheet.getByRole("link", { name: "SIMBAD" })).toBeVisible();

  // Escape closes the sheet only; the selected object stays.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/object\/vega$/);
  await expect(page.getByTestId("about-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("next and previous switch tracks; previous goes back to what was playing", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/object/vega");
  await byId(page, "next-track").click();
  await expect(page).not.toHaveURL(/\/object\/vega$/);
  await expect(byId(page, "now-playing")).not.toHaveText("Vega");
  await byId(page, "prev-track").click();
  await expect(page).toHaveURL(/\/object\/vega$/);
  await expect(byId(page, "now-playing")).toHaveText("Vega");
  expect(errors).toEqual([]);
});

test("space pauses and resumes the music", async ({ page }) => {
  await page.goto("/object/vega");
  const toggle = byId(page, "play-toggle");
  await toggle.click(); // first sound needs a click (autoplay policy)
  await expect(toggle).toHaveAttribute("aria-label", "Pause");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // focus leaves the button
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-label", "Play");
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-label", "Pause");
});

test("the home panel folds away and back", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Listen to the sky" });
  const chip = page.getByRole("link", { name: "Saturn", exact: true }).filter({ visible: true });
  await expect(chip).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(chip).toHaveCount(0);
  await toggle.click();
  await expect(chip).toBeVisible();
});

test("scrolling up on the About sheet closes it", async ({ page }) => {
  await page.goto("/");
  const sheet = page.getByTestId("about-sheet");
  await page.getByTestId("about-toggle").click();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(700); // let it finish sliding in
  const box = (await sheet.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.wheel(0, -120);
  await expect(sheet).toBeHidden();
});

test("settings: zoom is off by default and can be turned on; home shows the playing object", async ({ page }) => {
  const errors = collectErrors(page);
  const fov = () => page.evaluate(() => (window as unknown as { __skysoundFov?: () => number }).__skysoundFov?.() ?? 0);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Zoom off: selecting turns the camera but keeps the wide view.
  await page.getByRole("link", { name: "Saturn", exact: true }).filter({ visible: true }).click();
  await expect(byId(page, "now-playing")).toHaveText("Saturn");
  await page.waitForTimeout(4000);
  expect(await fov()).toBeGreaterThan(40);

  // Turning zoom on flies into the telescope view.
  const panel = byId(page, "settings-panel");
  await panel.getByRole("button", { name: /^Settings/ }).click();
  await panel.getByText("Zoom in on selected objects").click();
  await expect(panel.getByTestId("zoom-on-select")).toBeChecked();
  await expect.poll(fov, { timeout: 8000 }).toBeLessThan(10);

  // Back home, the playing object's card replaces the object list…
  await page.getByRole("link", { name: "← Whole sky" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  const card = byId(page, "home-track");
  await expect(card).toBeVisible();
  await expect(card.getByText("Now playing")).toBeVisible();
  await expect(card.getByRole("heading", { name: "Saturn" })).toBeVisible();
  // …unless the setting says otherwise.
  await panel.getByText("Playing object on the home page").click();
  await expect(panel.getByTestId("home-shows-track")).not.toBeChecked();
  await expect(byId(page, "home-track")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Listen to the sky" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("about is its own button next to the player bar", async ({ page }) => {
  await page.goto("/");
  const about = byId(page, "about-toggle");
  const bar = (await byId(page, "play-toggle").boundingBox())!;
  const box = (await about.boundingBox())!;
  expect(box.x).toBeGreaterThan(bar.x + 200); // after the bar, not inside the transport
  expect(await about.evaluate((el) => !!el.closest('[data-testid="player-bar"]'))).toBe(false);
});

test("settings start collapsed and expand on demand", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const panel = byId(page, "settings-panel");
  const header = panel.getByRole("button", { name: /^Settings/ });
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
  await expect(page.getByText("Из научных каталогов").filter({ visible: true })).toBeVisible();
});

test("auto-switch moves to another object after the chosen time", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const panel = byId(page, "settings-panel");
  await panel.getByRole("button", { name: /^Settings/ }).click();
  await panel.getByText("Auto-switch objects").click();
  await panel.getByRole("radio", { name: "1 min" }).click();
  await panel.getByRole("radio", { name: "In order" }).click();

  await page.getByRole("link", { name: "Sun", exact: true }).click();
  await expect(byId(page, "now-playing")).toHaveText("Sun", { timeout: 10_000 });
  await expect(byId(page, "switch-countdown")).toContainText("next in 0:");
  await expect(byId(page, "now-playing")).not.toHaveText("Sun", { timeout: 75_000 });
  await expect(page).not.toHaveURL(/\/object\/sun$/);
});
