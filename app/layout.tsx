import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fish - Turn Ocean Network compute into easy AI",
  description:
    "Fish is an Ocean Navy-built product concept that turns Ocean Network compute into simple AI access, provider demand, and OCEAN utility."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
