import type { Metadata } from "next";
import "./globals.css";
import { CentralChatbot } from "@/components/shared/CentralChatbot";

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
      <body suppressHydrationWarning>
        {children}
        <CentralChatbot />
      </body>
    </html>
  );
}
