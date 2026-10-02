"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/LangProvider";
import { useSky } from "@/components/sky/SkyProvider";

/** A crawlable link that, on click, selects the object through the sky (camera flight + music). */
export function ObjectLink({ slug, name, ...props }: { slug: string; name: string } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const { select } = useSky();
  const { href } = useLang();
  return (
    <Link
      {...props}
      href={href(`/object/${slug}`)}
      scroll={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        select({ slug, name });
      }}
    />
  );
}
