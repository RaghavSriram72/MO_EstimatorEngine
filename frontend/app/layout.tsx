import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MO Estimator Engine",
  description: "Midnight Oil cost estimation tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
