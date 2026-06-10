import { Menu } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

type MobileNavLink = {
  href: string;
  label: string;
};

/**
 * Zero-JS disclosure menu for viewports below `md`, where the inline header
 * nav is hidden (audit gap #3). Server-component friendly: plain <details>.
 */
export function MobileNavMenu({ links }: { links: MobileNavLink[] }) {
  return (
    <details className="relative md:hidden">
      <summary
        aria-label="Open navigation menu"
        className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-fish-accent/30 bg-fish-accent/10 text-fish-accent [&::-webkit-details-marker]:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </summary>
      <nav aria-label="Mobile navigation" className="absolute right-0 top-12 z-40 w-60 rounded-3xl border border-fish-accent/25 bg-fish-navy950/95 p-3 shadow-harbor backdrop-blur-xl">
        {links.map((link) => (
          <Link key={`${link.href}-${link.label}`} href={link.href as Route} className="block rounded-2xl px-4 py-3 text-sm font-black text-fish-primary transition hover:bg-fish-accent/10 hover:text-white">
            {link.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
