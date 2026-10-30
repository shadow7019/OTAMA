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
  title: "CineX — Stream Movies & TV Shows",
  description:
    "Browse trending movies and TV shows, watch trailers and stream instantly. Powered by TMDB.",
  keywords: ["movies", "tv shows", "streaming", "watch online", "trailers", "TMDB"],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "CineX — Stream Movies & TV Shows",
    description: "Browse trending movies and TV shows, watch trailers and stream instantly.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
