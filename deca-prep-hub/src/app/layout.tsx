import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DECA Prep Hub",
  description:
    "A student preparation hub for DECA roleplays, cluster exams, analytics, and event planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
