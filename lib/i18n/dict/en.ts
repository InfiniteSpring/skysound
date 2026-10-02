import type { ObjectType } from "../../sources/types";

const en = {
  siteName: "Music of the Cosmos",
  /** Wordmark: a quiet line above an accented one (quiet may be empty where splitting reads oddly). */
  brand: ["Music of the", "Cosmos"] as [string, string],
  siteDescription:
    "An interactive sky map where every planet, pulsar and variable star sounds different: music generated in your browser from real scientific data.",
  home: {
    title: "Listen to the sky",
    tagline: "Every object plays its own data — spin sets the tempo, heat the timbre, distance the echo.",
    groups: { solar: "Solar system", stars: "Stars", pulsars: "Pulsars" },
    objectsNav: "Objects",
  },
  search: {
    placeholder: "Find a star, planet, pulsar…",
    label: "Search for an object",
    searching: "Searching the database and catalogs…",
    searchingMore: "Still searching scientific catalogs…",
    nothing: "Nothing found",
    local: "Already in the sky",
    remote: "From scientific catalogs",
  },
  player: {
    play: "Play",
    pause: "Pause",
    loading: (name: string) => `Fetching “${name}” from scientific catalogs…`,
    pick: "Pick an object in the sky — and it will sound",
    unsupported: "This browser does not support Web Audio",
    genre: "Genre",
    volume: "Volume",
    reverb: "reverb",
    sec: "s",
    scales: { aeolian: "minor", dorian: "dorian", mixolydian: "mixolydian", major: "major", lydian: "lydian" } as Record<string, string>,
  },
  settings: {
    title: "Sound settings",
    crossfade: "Transition between tracks",
    autoSwitch: "Auto-switch objects",
    autoSwitchHint: "The sky moves on to another object by itself while you listen.",
    playEach: "Play each object",
    minutes: (m: number) => `${m} min`,
    minutesLabel: "Minutes per object",
    duration: "Duration",
    next: "Next object",
    order: "Order",
    orders: { random: "Random", sequential: "In order", same_type: "Same type" },
    switchIn: (clock: string) => `next in ${clock}`,
  },
  object: {
    back: "← Whole sky",
    listen: "▶ Listen",
    pause: "Pause",
    loading: "Fetching data from scientific catalogs…",
    sources: "Data",
    fallbackTitle: "Object",
    facts: {
      type: "Type",
      spectral: "Spectral class",
      variability: "Variability type",
      spin: "Rotation period",
      lightPeriod: "Light period",
      orbit: "Orbital period",
      temperature: "Temperature",
      luminosity: "Luminosity",
      distance: "Distance",
      magnitude: "Apparent magnitude",
      amplitude: "Amplitude",
      coords: "Coordinates (RA, Dec)",
      mag: "mag",
    },
  },
  errors: {
    notFound: "No catalog knows this object",
    unavailable: "Catalogs are unavailable right now, please try later",
    timeout: "Catalogs are taking too long to answer",
    generic: "Could not load the object",
    notFoundTitle: "This object is not in the catalogs",
    notFoundHint: "Try searching for it under another name.",
    backToSky: "Back to the sky",
  },
  language: "Language",
  types: {
    star: "star",
    planet: "planet",
    pulsar: "pulsar",
    variable_star: "variable star",
    star_system: "star system",
    moon: "moon",
    small_body: "small body",
    other: "object",
  } as Record<ObjectType, string>,
  units: { ms: "ms", s: "s", min: "min", h: "h", d: "days", yr: "years", au: "AU", ly: "light-years" },
  /** Templates for generated descriptions (objects without a curated text). */
  describe: {
    lead: (name: string, type: string, spectral?: string) =>
      `${name} is ${/^[aeiou]/i.test(type) ? "an" : "a"} ${type}${spectral ? ` of spectral class ${spectral}` : ""}`,
    distance: (d: string) => `${d} away`,
    temperature: (k: number) => `with a temperature of about ${k} K`,
    spin: (p: string) => `spinning once every ${p}`,
    variability: (p: string, amp?: number) => `varying in brightness every ${p}${amp ? ` by ${amp} mag` : ""}`,
    orbit: (p: string) => `completing an orbit in ${p}`,
    join: (lead: string, facts: string[]) =>
      `${lead}${facts.length ? ", " + facts.join(", ") : ""}. The music is built from these parameters.`,
  },
  /** Captions for model light curves. */
  curve: {
    pulsating: (v: string) => `Model light curve of a pulsating variable${v}, from the VSX period`,
    eclipsing: (v: string) => `Model light curve of an eclipsing binary${v}, from the VSX period`,
    semiregular: (v: string) => `Model light curve of a semi-regular variable${v}, from the VSX period`,
    sine: (v: string) => `Sinusoidal model light curve${v}`,
    pulse: () => "Model pulse profile",
    pulse_interpulse: () => "Model pulse profile with an interpulse",
  },
};

export type Dictionary = typeof en;
export default en;
