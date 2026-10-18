"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSky, type SelectTarget } from "@/components/sky/SkyProvider";
import { searchObjects, type SearchResults } from "@/lib/client/api";
import { useLang } from "@/components/i18n/LangProvider";

interface Option extends SelectTarget {
  section: "local" | "remote";
  hint: string;
}

export function SearchBox() {
  const { select } = useSky();
  const { t, nameOf, lang } = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResults>({ local: [], remote: [] });
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // Stored objects first (instant), then catalogs (Wikidata/SIMBAD/JPL take a few seconds).
      searchObjects(query, lang, ctrl.signal, false)
        .then((r) => {
          setResults((prev) => ({ local: r.local, remote: prev.remote }));
          setActive(0);
        })
        .catch(() => {});
      searchObjects(query, lang, ctrl.signal, true)
        .then((r) => setResults(r))
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setBusy(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, lang]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const options: Option[] = [
    ...results.local.map((o) => ({ slug: o.slug, name: nameOf(o), section: "local" as const, hint: t.types[o.type] })),
    ...results.remote.map((c) => ({ slug: c.slug, name: c.name, ref: c.ref, section: "remote" as const, hint: c.hint ?? c.source })),
  ];

  const choose = (o: Option) => {
    select(o);
    setOpen(false);
    setQ("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && q.trim().length >= 2;

  return (
    <div ref={rootRef} className="pointer-events-auto relative w-full max-w-sm">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setBusy(e.target.value.trim().length >= 2);
          if (e.target.value.trim().length < 2) setResults({ local: [], remote: [] });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={t.search.placeholder}
        aria-label={t.search.label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className="w-full rounded-2xl border border-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 backdrop-blur-md outline-none transition-colors focus:border-white/30"
      />
      {busy && (
        <span className="absolute end-4 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border border-white/30 border-t-white" />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-white/10 py-1 text-sm shadow-2xl backdrop-blur-md"
        >
          {options.length === 0 && (
            <li className="px-4 py-2 text-white/50">{busy ? t.search.searching : t.search.nothing}</li>
          )}
          {options.map((o, i) => (
            <li key={`${o.section}:${o.slug}`} role="option" aria-selected={i === active}>
              {(i === 0 || options[i - 1].section !== o.section) && (
                <div className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-widest text-white/35">
                  {o.section === "local" ? t.search.local : t.search.remote}
                </div>
              )}
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-start ${i === active ? "bg-white/10" : ""}`}
              >
                <span className="truncate text-white">{o.name}</span>
                <span className="shrink-0 truncate text-xs text-white/40">{o.hint}</span>
              </button>
            </li>
          ))}
          {options.length > 0 && busy && (
            <li className="px-4 py-2 text-xs text-white/40">{t.search.searchingMore}</li>
          )}
        </ul>
      )}
    </div>
  );
}
