import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tradeboard",
  description: "Real-time crypto paper-trading dashboard built with Next.js, TypeScript and Supabase.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
