import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Book Illustration Studio",
  description: "Gradion's local book illustration workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
