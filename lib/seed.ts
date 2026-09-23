/**
 * Seed objects: curated Russian names and descriptions on top of catalog data.
 * Shared by scripts/seed.ts and generateStaticParams (seed pages are prerendered).
 */
export interface SeedEntry {
  slug: string;
  ref: string;
  name: string;
  description: string;
}

export const SEED: SeedEntry[] = [
  {
    slug: "sun",
    ref: "jpl:10",
    name: "Солнце",
    description:
      "Наша звезда — жёлтый карлик класса G2V. Его вращение (около 25 суток на экваторе) задаёт медленный пульс, а температура фотосферы — тёплый тембр.",
  },
  {
    slug: "jupiter",
    ref: "jpl:599",
    name: "Юпитер",
    description:
      "Крупнейшая планета Солнечной системы: оборот вокруг Солнца за 11,86 года и самые быстрые сутки — меньше 10 часов. Холодная атмосфера даёт тёмный, глубокий звук.",
  },
  {
    slug: "saturn",
    ref: "jpl:699",
    name: "Сатурн",
    description:
      "Окольцованный газовый гигант с орбитальным периодом 29,5 года. Соотношение его орбиты с орбитой Юпитера близко к 5:2 — это слышно в гармонии.",
  },
  {
    slug: "crab-pulsar",
    ref: "simbad:PSR B0531+21",
    name: "Пульсар в Крабовидной туманности",
    description:
      "Нейтронная звезда, оставшаяся от сверхновой 1054 года. Она поворачивается 30 раз в секунду — этот ритм, сжатый октавами, становится темпом трека.",
  },
  {
    slug: "vela-pulsar",
    ref: "simbad:PSR B0833-45",
    name: "Пульсар Парусов",
    description:
      "Пульсар Vela совершает около 11 оборотов в секунду и известен внезапными «глитчами» — скачками скорости вращения.",
  },
  {
    slug: "betelgeuse",
    ref: "simbad:* alf Ori",
    name: "Бетельгейзе",
    description:
      "Красный сверхгигант в плече Ориона. Полуправильная переменность с периодом около 400 суток медленно дышит в громкости и фильтре.",
  },
  {
    slug: "delta-cephei",
    ref: "simbad:* del Cep",
    name: "Дельта Цефея",
    description:
      "Прототип цефеид: блеск растёт быстро и спадает медленно с периодом 5,37 суток. По таким звёздам измеряют расстояния во Вселенной.",
  },
  {
    slug: "algol",
    ref: "simbad:* bet Per",
    name: "Алголь",
    description:
      "«Демонова звезда» — затменная двойная: каждые 2,87 суток тусклый компаньон заслоняет яркую звезду, и блеск резко падает.",
  },
];

export const SEED_SLUGS = SEED.map((s) => s.slug);
