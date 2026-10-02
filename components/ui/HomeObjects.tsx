"use client";

import { useState } from "react";
import { ObjectLink } from "./ObjectLink";

export interface HomeGroup {
  key: string;
  title: string;
  items: { slug: string; name: string; type: string }[];
}

/**
 * Object chips grouped in tabs. Every group stays in the HTML (crawlable links);
 * only the active one is shown, which keeps the panel light.
 */
export function HomeObjects({ groups, label }: { groups: HomeGroup[]; label: string }) {
  const [active, setActive] = useState(groups[0]?.key);
  return (
    <nav aria-label={label} className="mt-4">
      <div role="tablist" className="flex gap-1 text-[11px]">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={g.key === active}
            onClick={() => setActive(g.key)}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              g.key === active ? "bg-white/15 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            {g.title}
            <span className="ms-1 text-white/35">{g.items.length}</span>
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.key} role="tabpanel" hidden={g.key !== active} className="mt-2.5 flex flex-wrap gap-1.5">
          {g.items.map((o) => (
            <ObjectLink
              key={o.slug}
              slug={o.slug}
              name={o.name}
              title={o.type}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/65 transition hover:border-white/30 hover:text-white"
            >
              {o.name}
            </ObjectLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
