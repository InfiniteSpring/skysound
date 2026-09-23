import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test("home renders the sky, objects and player", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Послушайте небо" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("link", { name: "Бетельгейзе" })).toBeVisible();
  await expect(page.getByTestId("play-toggle")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/home.png" });
  expect(errors).toEqual([]);
});

test("object page ships server-rendered HTML with meta tags", async ({ request }) => {
  const html = await (await request.get("/object/delta-cephei")).text();
  expect(html).toContain("<title>Дельта Цефея — переменная звезда · Музыка космоса</title>");
  expect(html).toMatch(/<meta name="description" content="Прототип цефеид/);
  expect(html).toContain('data-testid="object-name">Дельта Цефея<');
});

test("selecting objects plays music that survives navigation and genre changes", async ({ page }) => {
  const errors = collectErrors(page);
  const ctxState = () => page.evaluate(() => (window as unknown as { __skysoundAudio?: () => string }).__skysoundAudio?.());
  const toggle = page.getByTestId("play-toggle");

  await page.goto("/");
  // The click both unlocks audio and selects: the object starts playing on arrival.
  await page.getByRole("link", { name: "Юпитер" }).click();
  await expect(page).toHaveURL(/\/object\/jupiter$/);
  await expect(page.getByTestId("object-name")).toHaveText("Юпитер");
  await expect(toggle).toHaveAttribute("aria-label", "Пауза", { timeout: 15_000 });
  await expect(page.getByText(/BPM/)).toBeVisible();
  expect(await ctxState()).toBe("running");

  // Pause, then explicitly pick another object: it plays, in the same AudioContext.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "Играть");
  await page.getByRole("link", { name: "← Всё небо" }).click();
  await page.getByRole("link", { name: "Алголь" }).click();
  await expect(page).toHaveURL(/\/object\/algol$/);
  await expect(toggle).toHaveAttribute("aria-label", "Пауза", { timeout: 15_000 });
  await expect(page.getByTestId("now-playing")).toHaveText("Алголь");
  expect(await ctxState()).toBe("running");

  // Genre switch crossfades without stopping.
  await page.getByRole("radio", { name: "Lo-fi" }).click();
  await expect(page.getByRole("radio", { name: "Lo-fi" })).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(2500);
  await expect(toggle).toHaveAttribute("aria-label", "Пауза");
  expect(await ctxState()).toBe("running");
  await page.screenshot({ path: "test-results/object.png" });
  expect(errors).toEqual([]);
});

test("search finds stored objects", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Поиск объекта").fill("сатурн");
  await expect(page.getByRole("option").filter({ hasText: "Сатурн" })).toBeVisible({ timeout: 15_000 });
});
