"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LANG_NAMES, LANGS, localizePath, splitLocale } from "@/lib/i18n/config";
import { useLang } from "./LangProvider";

/** Language menu: keeps the current page, switches only the language. */
export function LangSwitch() {
  const { lang, t } = useLang();
  const { path } = splitLocale(usePathname());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.language}
        className="flex h-[38px] items-center gap-1.5 rounded-2xl border border-white/10 bg-[#0b0d18]/50 px-3 text-xs text-white/80 backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M1.5 8h13M8 1.5c1.8 1.9 2.7 4 2.7 6.5S9.8 12.6 8 14.5C6.2 12.6 5.3 10.5 5.3 8S6.2 3.4 8 1.5Z" />
        </svg>
        <span className="uppercase">{lang}</span>
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          className="absolute end-0 top-full z-30 mt-2 grid w-44 grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d18]/50 py-1 text-sm shadow-2xl backdrop-blur-md"
        >
          {LANGS.map((l) => (
            <li key={l} role="none">
              <Link
                role="menuitem"
                href={localizePath(path, l)}
                scroll={false}
                hrefLang={l}
                lang={l}
                aria-current={l === lang ? "true" : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-4 py-1.5 transition-colors ${
                  l === lang ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{LANG_NAMES[l]}</span>
                <span className="text-[10px] uppercase text-white/35">{l}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
