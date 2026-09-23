import { ObjectLink } from "@/components/ui/ObjectLink";
import { getSkyObjects } from "@/lib/objects/queries";
import { TYPE_LABELS_RU } from "@/lib/sources/normalize";

export default async function Home() {
  const objects = await getSkyObjects();
  return (
    <section className="mt-auto max-w-md">
      <h1 className="text-3xl font-light tracking-tight sm:text-4xl">Послушайте небо</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/60">
        Каждый объект звучит по своим данным: период пульсара задаёт темп, температура — тембр, кривая блеска —
        дыхание громкости, расстояние — глубину реверберации. Нажмите на светящуюся точку или найдите любую звезду.
      </p>
      <nav aria-label="Объекты" className="pointer-events-auto mt-5 flex flex-wrap gap-2">
        {objects.map((o) => (
          <ObjectLink
            key={o.slug}
            slug={o.slug}
            name={o.name}
            title={TYPE_LABELS_RU[o.type]}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition hover:border-white/30 hover:text-white"
          >
            {o.name}
          </ObjectLink>
        ))}
      </nav>
    </section>
  );
}
