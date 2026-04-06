import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import { LanguageProvider } from "@/components/language-provider";
import { DemoProvider } from "@/components/demo-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { FeatureFlagProvider } from "@/components/feature-flag-provider";
import DemoBanner from "@/components/demo-banner";
import ProfileModal from "@/components/profile-modal";
import DailyModal from "@/components/daily-modal";
import BottomNav from "@/components/bottom-nav";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = Sora({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "NF Society — Loteries décentralisées",
  description: "Plateforme de loteries transparentes et vérifiables sur la blockchain Circles"
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
          <FeatureFlagProvider>
            <DemoProvider>
              <LanguageProvider>
                <DemoBanner />
                {children}
                <ProfileModal />
                <DailyModal />
                <BottomNav />
              </LanguageProvider>
            </DemoProvider>
          </FeatureFlagProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
