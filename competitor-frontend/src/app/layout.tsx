import type { Metadata } from "next";
import {
  Geist_Mono,
  Inter,
  Pixelify_Sans,
  Press_Start_2P,
} from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const pixelHeader = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel-header",
  subsets: ["latin"],
  display: "swap",
});

const pixelBody = Pixelify_Sans({
  variable: "--font-pixel-body",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
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
      className={`dark ${inter.variable} ${pixelHeader.variable} ${pixelBody.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col font-sans relative">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(new URLSearchParams(window.location.search).get("client")==="desktop"){document.cookie="mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";}}catch(e){}})();`,
          }}
        />
        {children}
        <div className="pixel-noise-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
