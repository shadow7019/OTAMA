import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OTAMA — Torrent Streaming for the Web",
  description:
    "OTAMA is a modern web UI for streaming torrents: movies, TV and anime with live swarm stats, resume playback and ThePirateBay search. Use responsibly — stream only content you have rights to.",
  keywords: ["OTAMA", "torrent", "streaming", "webtorrent", "next.js", "peerflix"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "OTAMA — Torrent Streaming for the Web",
    description: "Stream torrents in your browser with live stats and resume playback.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0d0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
