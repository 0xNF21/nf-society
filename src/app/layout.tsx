import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import { LanguageProvider } from "@/components/language-provider";
import ProfileModal from "@/components/profile-modal";

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
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <LanguageProvider>
          {children}
          <ProfileModal />
        </LanguageProvider>
      </body>
    </html>
  );
}
