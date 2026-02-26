import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SmoothScroll from "./components/SmoothScroll";

const helvetica = localFont({
  src: [
    {
      path: "./fonts/Helvetica.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Helvetica-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Epilepsi Test",
  description: "Interactive fluid shader hero",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={helvetica.variable}>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
