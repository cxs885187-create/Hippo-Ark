import type { Metadata } from "next";
import { Bebas_Neue, IBM_Plex_Mono, Newsreader, Space_Grotesk } from "next/font/google";

import "./globals.css";

const uiFont = Space_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const displayFont = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const serifFont = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "海马体方舟",
  description: "海马体方舟：基于生成式AI的老年隐性知识萃取与认知健康无感监测科研网站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${uiFont.variable} ${monoFont.variable} ${displayFont.variable} ${serifFont.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
