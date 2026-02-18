import type { Metadata } from "next";
import "./globals.css";
import FutureFeatures from "./components/FutureFeatures";
import AppNav from "./components/AppNav";

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
        <div className="flex min-h-screen bg-gray-50">
          <AppNav />
          <main className="flex-1 min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
            {children}
          </main>
        </div>
        <FutureFeatures />
      </body>
    </html>
  );
}

