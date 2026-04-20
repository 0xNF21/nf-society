"use client";

import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function ImprintPage() {
  const { locale } = useLocale();
  const t = translations.legal;

  const content = locale === "fr" ? (
    <>
      <h1>{t.imprintTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]} : 2026-04-20
      </p>

      <h2>Editeur</h2>
      <p>
        NF Society DAO — organisation decentralisee communautaire.
      </p>
      <p>
        Forme juridique, siege et representant legal a definir selon la structuration du DAO.
      </p>

      <h2>Contact</h2>
      <p>
        Canal Telegram officiel : a completer.
      </p>
      <p>
        Bouton support disponible sur toutes les pages de la plateforme.
      </p>

      <h2>Hebergement</h2>
      <p>
        Application : Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, USA.
      </p>
      <p>
        Base de donnees : Neon, Inc. — San Francisco, CA, USA.
      </p>
      <p>
        Infrastructure blockchain : Gnosis Chain (chain ID 100), reseau public decentralise.
      </p>

      <h2>Propriete intellectuelle</h2>
      <p>
        Le code source de NF Society est open source. Les marques et logos restent la propriete de leurs titulaires
        respectifs (Circles, Gnosis).
      </p>

      <h2>Signalement</h2>
      <p>
        Pour tout signalement de contenu illicite, contacter le DAO via le support ou le canal Telegram officiel.
      </p>
    </>
  ) : (
    <>
      <h1>{t.imprintTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]}: 2026-04-20
      </p>

      <h2>Publisher</h2>
      <p>
        NF Society DAO — community decentralized organization.
      </p>
      <p>
        Legal form, headquarters and legal representative to be defined according to DAO structuring.
      </p>

      <h2>Contact</h2>
      <p>
        Official Telegram channel: to be completed.
      </p>
      <p>
        Support button available on all platform pages.
      </p>

      <h2>Hosting</h2>
      <p>
        Application: Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, USA.
      </p>
      <p>
        Database: Neon, Inc. — San Francisco, CA, USA.
      </p>
      <p>
        Blockchain infrastructure: Gnosis Chain (chain ID 100), decentralized public network.
      </p>

      <h2>Intellectual property</h2>
      <p>
        NF Society source code is open source. Brands and logos remain the property of their respective holders
        (Circles, Gnosis).
      </p>

      <h2>Reporting</h2>
      <p>
        For any report of illegal content, contact the DAO via support or the official Telegram channel.
      </p>
    </>
  );

  return content;
}
