import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fish - Turn Ocean Network compute into easy AI",
  description:
    "Fish is an Ocean Navy-built product concept that turns Ocean Network compute into simple AI access, provider demand, and OCEAN utility.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-fish-accent px-5 py-3 text-sm font-black text-fish-navy950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
