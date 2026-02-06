import type { Metadata } from "next";
import "./globals.css";
import FutureFeatures from "./components/FutureFeatures";

export const metadata: Metadata = {
  title: "Shift Close",
  description: "Gas Station End of Shift Closing System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <FutureFeatures />
      </body>
    </html>
  );
}

