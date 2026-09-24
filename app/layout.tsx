import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Planorama · See the plan. Shape the outcome.",
  description: "A local visual review space for implementation plans.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
