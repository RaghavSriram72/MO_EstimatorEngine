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
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&icon_names=visibility" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
