import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Space_Grotesk, Sora } from "next/font/google";
import { LanguageProvider } from "@/components/language-provider";
import { DemoProvider } from "@/components/demo-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { MiniAppProvider } from "@/components/miniapp-provider";
import { AuthProvider } from "@/components/auth-provider";
import { FeatureFlagProvider } from "@/components/feature-flag-provider";
import DemoBanner from "@/components/demo-banner";
import StakesDisabledBanner from "@/components/stakes-disabled-banner";
import ProfileModal from "@/components/profile-modal";
import DailyModal from "@/components/daily-modal";
import BottomNav from "@/components/bottom-nav";
import SupportButton from "@/components/support-button";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = Sora({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "NF Society — Community Gaming Platform",
  description: "Arcade Free-to-Play, XP progression, badges and community rewards on NF Society.",
  metadataBase: new URL("https://nf-society.vercel.app"),
  openGraph: {
    title: "NF Society",
    description: "Arcade Free-to-Play, XP progression, badges and community rewards on NF Society.",
    url: "https://nf-society.vercel.app",
    siteName: "NF Society",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NF Society",
    description: "Arcade Free-to-Play, XP progression, badges and community rewards on NF Society.",
  },
  icons: {
    icon: "/nf-society-logo.png",
    apple: "/nf-society-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b1f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-screen pb-16 sm:pb-0">
        <ThemeProvider>
          <DemoProvider>
            <LanguageProvider>
              <MiniAppProvider>
                <AuthProvider>
                  <FeatureFlagProvider>
                    <StakesDisabledBanner />
                    <DemoBanner />
                    {children}
                    <ProfileModal />
                    <DailyModal />
                    <BottomNav />
                    <SupportButton />
                  </FeatureFlagProvider>
                </AuthProvider>
              </MiniAppProvider>
            </LanguageProvider>
          </DemoProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
