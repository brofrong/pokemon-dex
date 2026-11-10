import { expect, test } from "bun:test";
import { nextThemePref, resolveTheme } from "../../src/scripts/theme";

test("resolveTheme follows the system preference when the pref is auto", () => {
  expect(resolveTheme("auto", true)).toBe("dark");
  expect(resolveTheme("auto", false)).toBe("light");
});

test("resolveTheme ignores the system preference for an explicit light/dark pref", () => {
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});

test("nextThemePref cycles auto -> light -> dark -> auto", () => {
  expect(nextThemePref("auto")).toBe("light");
  expect(nextThemePref("light")).toBe("dark");
  expect(nextThemePref("dark")).toBe("auto");
});
