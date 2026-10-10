"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/LangProvider";

export default function NotFound() {
  const { t, href } = useLang();
  return (
    <section className="pointer-events-auto mt-auto max-w-sm rounded-2xl border border-white/10 bg-[#0b0d18]/50 p-5 backdrop-blur-md">
      <h1 className="text-xl font-light">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-white/60">{t.errors.notFoundHint}</p>
      <Link href={href("/")} className="mt-4 inline-block text-sm text-white/70 underline">
        {t.errors.backToSky}
      </Link>
    </section>
  );
}
