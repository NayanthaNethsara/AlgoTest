import type { Metadata } from "next";
import { Geist_Mono, Pixelify_Sans, Press_Start_2P } from "next/font/google";
import "./globals.css";

const pixelHeader = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel-header",
  subsets: ["latin"],
});

const pixelBody = Pixelify_Sans({
  variable: "--font-pixel-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MiniAlgothon",
  description: "Algorithm challenge platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${pixelHeader.variable} ${pixelBody.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col font-sans relative">
        {children}
        <div className="pixel-noise-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
