import { readFileSync } from "node:fs";
import path from "node:path";
import { describe as suite, expect, it } from "vitest";
import { DEFAULT_LANG, dirOf, LANGS, localizePath, pick, splitLocale } from "@/lib/i18n/config";
import { describe, lightCurveNote } from "@/lib/i18n/describe";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { SEED } from "@/lib/seed";
import { normalize } from "@/lib/sources/normalize";

suite("routing", () => {
  it("keeps English unprefixed and prefixes other languages", () => {
    expect(DEFAULT_LANG).toBe("en");
    expect(localizePath("/", "en")).toBe("/");
    expect(localizePath("/object/sirius", "en")).toBe("/object/sirius");
    expect(localizePath("/", "ru")).toBe("/ru");
    expect(localizePath("/object/sirius", "ru")).toBe("/ru/object/sirius");
  });
  it("splits public paths back", () => {
    expect(splitLocale("/ru/object/sirius")).toEqual({ lang: "ru", path: "/object/sirius" });
    expect(splitLocale("/ru")).toEqual({ lang: "ru", path: "/" });
    expect(splitLocale("/object/rugby")).toEqual({ lang: "en", path: "/object/rugby" });
    expect(splitLocale("/")).toEqual({ lang: "en", path: "/" });
  });
  it("falls back to English, then the default", () => {
    expect(pick({ en: "Sun", ru: "Солнце" }, "ru", "x")).toBe("Солнце");
    expect(pick({ en: "Sun" }, "ru", "x")).toBe("Sun");
    expect(pick({}, "ru", "x")).toBe("x");
  });
});

suite("dictionaries", () => {
  const keys = (o: object, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  it("cover ten languages, English first", () => {
    expect(LANGS).toHaveLength(10);
    expect(LANGS[0]).toBe("en");
  });
  it.each(LANGS)("%s has every key the English dictionary has", (lang) => {
    expect(keys(DICTIONARIES[lang]).sort()).toEqual(keys(DICTIONARIES.en).sort());
  });
  it.each(LANGS)("%s describes objects and formats captions without throwing", (lang) => {
    const d = DICTIONARIES[lang];
    expect(d.describe.join(d.describe.lead("X", d.types.star, "G2V"), [d.describe.distance("1")])).toContain("X");
    expect(d.curve.eclipsing(" (EA)")).toContain("EA");
  });
  it("marks Arabic and Urdu as right-to-left", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("ur")).toBe("rtl");
    expect(dirOf("zh")).toBe("ltr");
  });
});

suite("content", () => {
  it("every seed object has a curated name and description in every language", () => {
    for (const s of SEED) {
      for (const lang of LANGS) {
        expect(s.names[lang]?.trim(), `${s.slug} ${lang}`).toBeTruthy();
        expect(s.descriptions[lang]?.length, `${s.slug} ${lang}`).toBeGreaterThan(20);
      }
    }
  });
  it("generates descriptions in both languages", () => {
    const raw = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/delta-cephei.json"), "utf8"));
    const o = normalize(raw, { slug: "delta-cephei" });
    expect(describe(o, "Delta Cephei", "en")).toMatch(/^Delta Cephei is a variable star .* light-years away/);
    expect(describe(o, "Дельта Цефея", "ru")).toMatch(/^Дельта Цефея — переменная звезда .*св\. лет/);
    expect(lightCurveNote(o.lightCurve!, "DCEP", "en")).toContain("pulsating variable (DCEP)");
  });
});
