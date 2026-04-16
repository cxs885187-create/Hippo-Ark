import Link from "next/link";

import { siteLinks } from "@/lib/content";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[rgba(249,248,246,0.92)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="text-base font-semibold tracking-[0.28em] text-black md:text-lg">
          海马体方舟
        </Link>
        <nav className="hidden gap-6 text-sm tracking-[0.18em] text-black/65 md:flex">
          {siteLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[var(--burnt)]">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
