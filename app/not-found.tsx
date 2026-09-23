import Link from "next/link";

export default function NotFound() {
  return (
    <section className="pointer-events-auto mt-auto max-w-sm rounded-2xl border border-white/10 bg-[#0b0d18]/75 p-5 backdrop-blur-md">
      <h1 className="text-xl font-light">Такого объекта нет в каталогах</h1>
      <p className="mt-2 text-sm text-white/60">Попробуйте найти его по другому имени через поиск.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-white/70 underline">
        Вернуться к небу
      </Link>
    </section>
  );
}
