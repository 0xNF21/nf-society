"use client";

import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type Locale = "fr" | "en";
type T = typeof translations.legal;

function CookiesContentFr({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.cookiesTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]} : 2026-04-20
      </p>

      <h2>1. Qu'est-ce qu'un cookie ?</h2>
      <p>
        Un cookie est un petit fichier depose sur ton appareil par le site que tu consultes. NF Society utilise
        uniquement le stockage local du navigateur (localStorage), pas de cookies tiers de tracking.
      </p>

      <h2>2. Stockage local utilise</h2>
      <ul>
        <li><strong>nf-demo</strong> : boolean pour activer le mode demo</li>
        <li><strong>nf-demo-progress</strong> : progression XP en mode demo (niveau, streak)</li>
        <li><strong>nf-locale</strong> : langue choisie (FR/EN)</li>
        <li><strong>nf-theme</strong> : theme clair ou sombre</li>
        <li><strong>nf-player-token-*</strong> : jetons de session pour les jeux en cours (anti-triche)</li>
      </ul>

      <h2>3. Finalite</h2>
      <p>
        Le stockage local est strictement necessaire au fonctionnement de la plateforme : preferences utilisateur,
        mode demo, identification de session pendant une partie. Aucune donnee n'est transmise a des tiers publicitaires.
      </p>

      <h2>4. Cookies tiers</h2>
      <p>
        Aucun cookie publicitaire ou de tracking tiers n'est utilise. Aucun outil d'analytics n'est installe pour
        l'instant. En cas d'ajout futur (par exemple Plausible, analytics auto-hebergees), cette page sera mise a jour
        et le consentement utilisateur sera recueilli.
      </p>

      <h2>5. Gerer le stockage local</h2>
      <p>
        Tu peux a tout moment effacer le stockage local depuis les parametres de ton navigateur. Attention : cela
        reinitialise le mode demo et les preferences.
      </p>

      <h2>6. Duree de conservation</h2>
      <p>
        Le stockage local est conserve jusqu'a ce que l'utilisateur le supprime manuellement ou vide son cache navigateur.
      </p>
    </>
  );
}

function CookiesContentEn({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.cookiesTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]}: 2026-04-20
      </p>

      <h2>1. What is a cookie?</h2>
      <p>
        A cookie is a small file placed on your device by the site you visit. NF Society only uses the browser's
        local storage (localStorage), no third-party tracking cookies.
      </p>

      <h2>2. Local storage used</h2>
      <ul>
        <li><strong>nf-demo</strong>: boolean to enable demo mode</li>
        <li><strong>nf-demo-progress</strong>: XP progress in demo mode (level, streak)</li>
        <li><strong>nf-locale</strong>: chosen language (FR/EN)</li>
        <li><strong>nf-theme</strong>: light or dark theme</li>
        <li><strong>nf-player-token-*</strong>: session tokens for ongoing games (anti-cheat)</li>
      </ul>

      <h2>3. Purpose</h2>
      <p>
        Local storage is strictly necessary for platform operation: user preferences, demo mode, session identification
        during a game. No data is transmitted to advertising third parties.
      </p>

      <h2>4. Third-party cookies</h2>
      <p>
        No third-party advertising or tracking cookies are used. No analytics tool is installed at the moment.
        If added in the future (e.g., Plausible, self-hosted analytics), this page will be updated and user consent
        will be collected.
      </p>

      <h2>5. Managing local storage</h2>
      <p>
        You can clear local storage at any time from your browser settings. Warning: this resets demo mode and preferences.
      </p>

      <h2>6. Retention period</h2>
      <p>
        Local storage is kept until the user manually removes it or clears the browser cache.
      </p>
    </>
  );
}

const CONTENT: Record<Locale, (props: { t: T; locale: Locale }) => JSX.Element> = {
  fr: CookiesContentFr,
  en: CookiesContentEn,
};

export default function CookiesPage() {
  const { locale } = useLocale();
  const t = translations.legal;
  const Content = CONTENT[locale];
  return <Content t={t} locale={locale} />;
}
