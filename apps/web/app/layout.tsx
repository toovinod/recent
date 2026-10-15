import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Recent",
  description:
    "Recent groups technology updates into stories with links to original posts and attributed reactions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#f2f0eb]">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#f2f0eb] font-sans text-ink antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
