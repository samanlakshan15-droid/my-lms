import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getOrCreateSiteSettings } from "@/lib/site-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMS Platform",
  description: "Custom LMS with video access control and admin management",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getOrCreateSiteSettings();

  return (
    <html lang="en">
      <body
        className="min-h-screen antialiased"
        style={{
          backgroundColor: settings.backgroundColor,
          color: settings.textColor,
          backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : "none",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        <div className="min-h-screen bg-black/20">{children}</div>
      </body>
    </html>
  );
}
