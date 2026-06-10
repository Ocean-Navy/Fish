import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

type MoreMenuLink = {
  href: string;
  label: string;
};

/**
 * Desktop "More" dropdown for the nav diet (zero-JS <details>, server-friendly).
 * Keeps the header to three primary destinations plus everything else in here.
 */
export function MoreMenu({ links }: { links: MoreMenuLink[] }) {
  return (
    <details className="relative hidden md:block">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-black text-fish-secondary transition hover:text-white [&::-webkit-details-marker]:hidden">
        More
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </summary>
      <nav aria-label="More pages" className="absolute right-0 top-9 z-40 w-56 rounded-3xl border border-fish-accent/25 bg-fish-navy950/95 p-3 shadow-harbor backdrop-blur-xl">
        {links.map((link) => (
          <Link key={`${link.href}-${link.label}`} href={link.href as Route} className="block rounded-2xl px-4 py-2.5 text-sm font-black text-fish-primary transition hover:bg-fish-accent/10 hover:text-white">
            {link.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
