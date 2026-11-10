/**
 * Final QA fix wave, batch B (data / i18n / evolution conditions), checked on the built pages:
 * Russian evolution-tree names (bug #2), Russian form names (#3), Gen I's single Special stat in
 * the stat bars and the list's total sort (#9, Ruling R-B9), evolution condition labels (#13,
 * #14) and the Russian name sort (#19).
 */
import { test, expect } from "./fixtures";
import { detailPath, listPath, waitForListSettled } from "./helpers";

/** Card ids in their rendered (CSS `order`) sequence, visible cards only. */
async function visibleCardOrder(
  page: import("@playwright/test").Page,
): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".card:not([hidden])"))
      .map((card) => ({
        id: Number(card.dataset.id),
        order: Number(card.style.order || "0"),
      }))
      .sort((a, b) => a.order - b.order)
      .map((card) => card.id),
  );
}

test("RU evolution tree shows Russian names and alt texts (#2)", async ({
  page,
}) => {
  await page.goto(detailPath("ru", "bw", "eevee"));
  const evo = page.locator(".evo-wrap");
  await expect(evo.locator(".mon b").first()).toHaveText("Иви");
  await expect(evo).toContainText("Вапореон");
  await expect(evo).not.toContainText("Vaporeon");
  await expect(evo.locator('img[alt="Вапореон"]').first()).toBeAttached();
});

test("RU form tiles are Russian, including Toxtricity's default form (#3)", async ({
  page,
}) => {
  await page.goto(detailPath("ru", "swsh", "toxtricity"));
  const tiles = page.locator("#pdx-form-tiles b");
  await expect(tiles).toHaveText([
    "Токстрисити (Восторженная Форма)",
    "Токстрисити (Восторженная Форма, Гигантамакс)",
    "Токстрисити (Сдержанная Форма, Гигантамакс)",
    "Токстрисити (Сдержанная Форма)",
  ]);
});

test("RU Toxtricity and Goodra condition labels separate or from and (#13)", async ({
  page,
}) => {
  await page.goto(detailPath("ru", "swsh", "toxtricity"));
  await expect(page.locator(".evo-wrap .arrow b").first()).toHaveText(
    "Ур. 30: характер «Бодрый» или «Спокойный»",
  );
  await page.goto(detailPath("ru", "xy", "goodra"));
  await expect(page.locator(".evo-wrap .arrow b").last()).toHaveText(
    "Ур. 50, во время дождя",
  );
});

test("a regional-form evolution is labelled with its form (#14)", async ({
  page,
}) => {
  await page.goto(detailPath("en", "sv", "meowth"));
  await expect(page.locator(".evo-wrap")).toContainText(
    "Lvl. 28, from Galarian form",
  );
  // Fix round 1: Alolan Meowth's own method is an extra alternative.
  await expect(page.locator(".evo-wrap")).toContainText(
    "Lvl. 28 or friendship, from Alolan form",
  );
});

test("RU Rockruff: one level, three times of day (fix round 1)", async ({
  page,
}) => {
  await page.goto(detailPath("ru", "sm", "rockruff"));
  await expect(page.locator(".evo-wrap .arrow b").first()).toHaveText(
    "Ур. 25: днём, ночью или вечером",
  );
});

test("Gen I shows one Special row and counts it once (#9)", async ({
  page,
}) => {
  await page.goto(detailPath("en", "rb", "gengar"));
  const labels = page.locator("#pdx-stats .stat:not(.total) span:first-child");
  await expect(labels).toHaveText([
    "HP",
    "Attack",
    "Defense",
    "Special",
    "Speed",
  ]);
  await expect(page.locator("#pdx-stats .stat.total b")).toHaveText("425");
});

test("Gen I total sort counts Special once: Mew and Dragonite above Moltres (#9)", async ({
  page,
}) => {
  await page.goto(listPath("en", "rb", "sort=total&dir=desc"));
  await waitForListSettled(page);
  const order = await visibleCardOrder(page);
  expect(order[0]).toBe(150); // Mewtwo, 590
  const pos = (id: number) => order.indexOf(id);
  expect(pos(151)).toBeLessThan(pos(146)); // Mew 500 > Moltres 495
  expect(pos(149)).toBeLessThan(pos(146)); // Dragonite 500 > Moltres 495
  await expect(page.locator('#pdx-sort option[value="spd"]')).toHaveCount(0);
  await expect(page.locator('#pdx-sort option[value="spa"]')).toHaveText(
    "Special",
  );
});

test("RU name sort treats ё as е (#19)", async ({ page }) => {
  await page.goto(listPath("ru", "sv", "sort=name"));
  await waitForListSettled(page);
  const order = await visibleCardOrder(page);
  // Слёрпафф (#685) sorts before Слиггу (#705), not after Слоупок (#79).
  expect(order.indexOf(685)).toBeLessThan(order.indexOf(705));
  expect(order.indexOf(685)).toBeLessThan(order.indexOf(79));
});
