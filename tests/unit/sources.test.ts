import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePulsarName, parseAtnf } from "@/lib/sources/atnf";
import { parseVsx, vsxAmplitude } from "@/lib/sources/aavso";
import { classifyJpl, jplRef, parseJpl } from "@/lib/sources/jpl";
import { modelLightCurve } from "@/lib/sources/lightcurve";
import { formatPeriod, normalize } from "@/lib/sources/normalize";
import { classifyOtype, parseSesame, parseSimbad, prettifySimbadId } from "@/lib/sources/simbad";
import { SpaceObjectSchema, type RawBundle } from "@/lib/sources/types";
import { slugify, slugToQuery } from "@/lib/slug";

const fixture = (slug: string): RawBundle =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", `${slug}.json`), "utf8"));

describe("slug", () => {
  it("slugifies catalog and Cyrillic names", () => {
    expect(slugify("PSR B0531+21")).toBe("psr-b0531-plus-21");
    expect(slugify("Бетельгейзе")).toBe("betelgeyze");
    expect(slugify("  Delta Cep ")).toBe("delta-cep");
    expect(slugify("1P/Halley")).toBe("1p-halley");
  });
  it("round-trips the plus sign for hand-typed slugs", () => {
    expect(slugToQuery("psr-b0531-plus-21")).toBe("psr b0531+21");
  });
});

describe("simbad", () => {
  it("prettifies identifiers", () => {
    expect(prettifySimbadId("* del Cep")).toBe("Delta Cep");
    expect(prettifySimbadId("NAME Betelgeuse")).toBe("Betelgeuse");
    expect(prettifySimbadId("V* CM Tau")).toBe("CM Tau");
    expect(prettifySimbadId("* alf01 Lib")).toBe("Alpha01 Lib");
  });

  it("parses Sesame XML and reports misses", () => {
    const xml = `<Sesame><Target><Resolver name="S"><oid>122671</oid><otype>cC*</otype><oname>* del Cep</oname></Resolver></Target></Sesame>`;
    expect(parseSesame(xml)).toEqual({ mainId: "* del Cep", otype: "cC*", oid: 122671 });
    expect(parseSesame("<Sesame><Target><INFO> *** Nothing found *** </INFO></Target></Sesame>")).toBeNull();
  });

  it("parses a real TAP bundle with cross-identifiers", () => {
    const s = parseSimbad(fixture("delta-cephei").simbad!);
    expect(s.mainId).toBe("* del Cep");
    expect(s.ra).toBeCloseTo(337.29, 1);
    expect(s.gaiaDr3).toMatch(/^\d+$/);
    expect(s.teffK).toBeGreaterThan(5000);
    expect(s.teffK).toBeLessThan(7000);
  });

  it("finds every PSR alias for pulsars", () => {
    const s = parseSimbad(fixture("vela-pulsar").simbad!);
    expect(s.pulsarNames).toContain("B0833-45");
  });

  it("classifies object types", () => {
    expect(classifyOtype("Psr")).toBe("pulsar");
    expect(classifyOtype("cC*")).toBe("variable_star");
    expect(classifyOtype("EB*")).toBe("star_system");
    expect(classifyOtype("s*r")).toBe("star");
    expect(classifyOtype("G")).toBe("other");
  });
});

describe("atnf", () => {
  it("parses the psrcat table", () => {
    const [p] = parseAtnf(fixture("crab-pulsar").atnf!);
    expect(p.jname).toBe("J0534+2200");
    expect(p.periodS).toBeCloseTo(0.0334, 4);
    expect(p.edotErgS).toBeGreaterThan(1e38);
  });
  it("normalizes pulsar names", () => {
    expect(normalizePulsarName("psr j0835-4510")).toBe("J0835-4510");
    expect(normalizePulsarName("B0531+21")).toBe("B0531+21");
    expect(normalizePulsarName("Vela")).toBeNull();
  });
});

describe("vsx", () => {
  it("parses VizieR TSV and computes amplitude", () => {
    const [v] = parseVsx(fixture("algol").vsx!);
    expect(v.name).toBe("bet Per");
    expect(v.type).toMatch(/^EA/);
    expect(v.periodDays).toBeCloseTo(2.867, 2);
    expect(vsxAmplitude(v)).toBeGreaterThan(1);
  });
});

describe("jpl", () => {
  it("parses physical data and ephemeris", () => {
    const j = parseJpl(fixture("jupiter").jpl!);
    expect(j.name).toBe("Jupiter");
    expect(j.orbitalPeriodDays).toBeCloseTo(4332.589, 2);
    expect(j.rotationPeriodS).toBeCloseTo(35729.7, 0);
    expect(j.temperatureK).toBe(165);
    expect(j.deltaAu).toBeGreaterThan(3);
  });
  it("prefers the Sun's effective temperature over photosphere layers", () => {
    expect(parseJpl(fixture("sun").jpl!).temperatureK).toBe(5772);
  });
  it("classifies lookup hits and builds refs", () => {
    expect(classifyJpl("barycenter", "Jupiter Barycenter")).toBeNull();
    expect(classifyJpl("natural satellite", "Titan")).toBe("moon");
    expect(jplRef({ spkid: "599", type: "planet", name: "Jupiter" })).toBe("jpl:599");
    expect(jplRef({ spkid: "1000036", type: "comet (integrated barycenter)", pdes: "1P", name: "Halley" })).toBe(
      "jpl:DES=1P;CAP;NOFRAG",
    );
  });
});

describe("normalize", () => {
  const cases: [string, string, (o: ReturnType<typeof normalize>) => void][] = [
    ["sun", "star", (o) => expect(o.params.temperature_k).toBe(5772)],
    ["jupiter", "planet", (o) => expect(o.params.orbital_period_days).toBeCloseTo(4332.6, 0)],
    ["saturn", "planet", (o) => expect(o.params.orbital_period_days).toBeCloseTo(10755.7, 0)],
    ["crab-pulsar", "pulsar", (o) => expect(o.params.period_s).toBeCloseTo(0.0334, 4)],
    ["vela-pulsar", "pulsar", (o) => expect(o.params.period_s).toBeCloseTo(0.0893, 4)],
    ["betelgeuse", "variable_star", (o) => expect(o.params.temperature_k).toBeLessThan(4000)],
    ["delta-cephei", "variable_star", (o) => expect(o.params.period_s! / 86400).toBeCloseTo(5.366, 2)],
    ["algol", "variable_star", (o) => expect(o.lightCurve?.samples.length).toBe(128)],
  ];

  it.each(cases)("%s -> %s", (slug, type, check) => {
    const obj = normalize(fixture(slug), { slug });
    expect(SpaceObjectSchema.safeParse(obj).success).toBe(true);
    expect(obj.type).toBe(type);
    expect(obj.position.ra_deg).toBeGreaterThanOrEqual(0);
    expect(obj.description.length).toBeGreaterThan(20);
    check(obj);
  });

  it("is deterministic, so params can be rebuilt from raw", () => {
    const a = normalize(fixture("betelgeuse"), { slug: "betelgeuse" });
    const b = normalize(JSON.parse(JSON.stringify(fixture("betelgeuse"))), { slug: "betelgeuse" });
    expect(a).toEqual(b);
  });

  it("applies curated overrides", () => {
    const o = normalize(fixture("sun"), { slug: "sun", name: "Солнце", description: "Наша звезда." });
    expect(o.name).toBe("Солнце");
    expect(o.description).toBe("Наша звезда.");
  });

  it("rejects bundles with no primary data", () => {
    expect(() => normalize({}, { slug: "x" })).toThrow();
  });
});

describe("light curves", () => {
  it("cepheid model rises faster than it falls", () => {
    const lc = modelLightCurve("DCEP", 5.37 * 86400)!;
    const peak = lc.samples.indexOf(1);
    expect(peak).toBeLessThan(lc.samples.length / 3);
  });
  it("algol model has a deep primary eclipse", () => {
    const lc = modelLightCurve("EA/SD", 2.87 * 86400)!;
    expect(Math.min(...lc.samples)).toBe(0);
    expect(lc.samples[64]).toBeGreaterThan(0.5);
  });
});

describe("format", () => {
  it("formats periods across scales", () => {
    expect(formatPeriod(0.0334)).toBe("33.4 мс");
    expect(formatPeriod(5.37 * 86400)).toBe("5.37 сут");
    expect(formatPeriod(11.86 * 365.25 * 86400)).toBe("11.9 лет");
  });
});
