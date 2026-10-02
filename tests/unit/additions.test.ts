import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pickNext } from "@/components/sky/SkyProvider";
import { DEFAULT_SETTINGS, sanitizeSettings } from "@/components/audio/AudioProvider";
import type { ObjectDto } from "@/lib/objects/dto";
import { parseJpl } from "@/lib/sources/jpl";
import { normalize, teffFromSpectralType } from "@/lib/sources/normalize";
import { classifyOtype } from "@/lib/sources/simbad";
import type { RawBundle } from "@/lib/sources/types";
import { needsLocalizedSearch, parseEntities, scriptLang } from "@/lib/sources/wikidata";

const fixture = (slug: string): RawBundle =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", `${slug}.json`), "utf8"));

describe("wikidata", () => {
  it("extracts localized label, English label and catalog ids", () => {
    const claim = (v: string) => [{ mainsnak: { datavalue: { value: v } } }];
    const json = {
      entities: {
        Q12124: {
          labels: { ru: { value: "Бетельгейзе" }, en: { value: "Betelgeuse" } },
          claims: { P3083: claim("* alf Ori") },
        },
        Q23054: { labels: { ru: { value: "Комета Галлея" }, en: { value: "Halley's Comet" } }, claims: { P716: claim("1000036") } },
        Q111: { labels: { ru: { value: "Марс" }, en: { value: "Mars" } }, claims: {} },
      },
    };
    expect(parseEntities(json, ["Q12124", "Q23054", "Q111", "Q404"], "ru")).toEqual([
      { id: "Q12124", label: "Бетельгейзе", enLabel: "Betelgeuse", simbad: "* alf Ori", spk: undefined },
      { id: "Q23054", label: "Комета Галлея", enLabel: "Halley's Comet", simbad: undefined, spk: "1000036" },
      { id: "Q111", label: "Марс", enLabel: "Mars", simbad: undefined, spk: undefined },
    ]);
  });
  it("routes localized queries through Wikidata", () => {
    expect(needsLocalizedSearch("Sirius", "en")).toBe(false);
    expect(needsLocalizedSearch("Сириус", "en")).toBe(true);
    expect(needsLocalizedSearch("Marte", "es")).toBe(true);
  });
  it("guesses the language from the script", () => {
    expect(scriptLang("Сириус")).toBe("ru");
    expect(scriptLang("火星")).toBe("zh");
    expect(scriptLang("मंगल")).toBe("hi");
    expect(scriptLang("মঙ্গল")).toBe("bn");
    expect(scriptLang("المريخ")).toBe("ar");
    expect(scriptLang("Mars")).toBeNull();
  });
});

describe("parser coverage", () => {
  it("reads Horizons orbits written with the unit before '='", () => {
    expect(parseJpl(fixture("venus").jpl!).orbitalPeriodDays).toBeCloseTo(224.7, 0);
  });
  it("reads rotation periods with uncertainties", () => {
    expect(parseJpl(fixture("uranus").jpl!).rotationPeriodS! / 3600).toBeCloseTo(17.24, 1);
  });
  it("treats synchronous moons as rotating once per orbit", () => {
    const io = parseJpl(fixture("io").jpl!);
    expect(io.orbitalPeriodDays).toBeCloseTo(1.77, 2);
    expect(io.rotationPeriodS).toBeCloseTo(1.77 * 86400, -2);
  });
  it("classifies candidate SIMBAD types", () => {
    expect(classifyOtype("LP?")).toBe("variable_star");
    expect(normalize(fixture("aldebaran"), { slug: "aldebaran" }).type).not.toBe("other");
  });
  it("estimates Teff from the spectral type", () => {
    expect(teffFromSpectralType("M1.5Iab+B2Vn")).toBeGreaterThan(3300);
    expect(teffFromSpectralType("M1.5Iab+B2Vn")).toBeLessThan(3900);
    expect(teffFromSpectralType("B8V")).toBeGreaterThan(10000);
    expect(teffFromSpectralType("LBV")).toBeUndefined();
  });
});

describe("auto-switch", () => {
  const obj = (slug: string, type: ObjectDto["type"]) => ({ slug, type }) as ObjectDto;
  const all = [obj("a", "planet"), obj("b", "pulsar"), obj("c", "planet"), obj("d", "star")];

  it("never repeats the current object", () => {
    for (const order of ["random", "sequential", "same_type"] as const) {
      for (let i = 0; i < 20; i++) expect(pickNext(all, all[0], order)?.slug).not.toBe("a");
    }
  });
  it("walks in order and wraps", () => {
    expect(pickNext(all, all[1], "sequential")?.slug).toBe("c");
    expect(pickNext(all, all[3], "sequential")?.slug).toBe("a");
  });
  it("prefers the same type, falling back to anything", () => {
    expect(pickNext(all, all[0], "same_type")?.slug).toBe("c");
    expect(["a", "c", "d"]).toContain(pickNext(all, all[1], "same_type")?.slug);
  });
  it("returns null when there is nothing else", () => {
    expect(pickNext([all[0]], all[0], "random")).toBeNull();
  });
});

describe("settings", () => {
  it("clamps and repairs stored settings", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ crossfadeS: 99, switchMinutes: 0, switchOrder: "nope", autoSwitch: "yes" })).toEqual({
      ...DEFAULT_SETTINGS,
      crossfadeS: 10,
      switchMinutes: 1,
    });
  });
});
