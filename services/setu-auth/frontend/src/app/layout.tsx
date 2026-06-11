import type { Metadata } from "next";
import "./globals.css";
import { CentralChatbot } from "@/components/shared/CentralChatbot";

export const metadata: Metadata = {
  title: "Shetu — The AI Care Bridge",
  description: "Shetu (সেতু) is the AI care bridge connecting mothers and patients to maternal and personal healthcare guidance.",
  icons: {
    icon: ["/favicon.ico", { url: "/icon.png", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
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
