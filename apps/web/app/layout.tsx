import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shadow Notino — keeps your Notion docs fresh after every PR",
  description:
    "An agentic GitHub-to-Notion documentation system. Watches merged pull requests, proposes Notion-native doc updates, and writes approved changes — with a human in the loop.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
