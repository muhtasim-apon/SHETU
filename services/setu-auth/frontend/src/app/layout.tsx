import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shetu — The AI Care Bridge",
  description: "Authentication for the Shetu maternal-health platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
