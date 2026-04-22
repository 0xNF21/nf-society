"use client";

import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type Locale = "fr" | "en";
type T = typeof translations.legal;

function PrivacyContentFr({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.privacyTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]} : 2026-04-20
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le traitement des donnees est assure par le DAO NF Society. Coordonnees de contact disponibles
        via le canal Telegram officiel ou le bouton support de la plateforme.
      </p>

      <h2>2. Donnees collectees</h2>
      <ul>
        <li>Adresse wallet Circles (identifiant public on-chain)</li>
        <li>Historique de parties et resultats (stockes en base PostgreSQL + on-chain)</li>
        <li>Pseudo et image de profil Circles (recuperes via le protocole Circles)</li>
        <li>Donnees techniques minimales (logs serveur anonymises, erreurs)</li>
        <li>Aucune donnee d'identification civile n'est collectee</li>
      </ul>

      <h2>3. Finalites</h2>
      <ul>
        <li>Fonctionnement des jeux et paiements on-chain</li>
        <li>Calcul des statistiques publiques et des classements (pseudonymises)</li>
        <li>Detection d'abus, fraude et comportements malveillants</li>
        <li>Support utilisateur via Telegram</li>
      </ul>

      <h2>4. Base legale</h2>
      <p>
        Execution du service (CGU) et interet legitime du DAO a lutter contre la fraude.
      </p>

      <h2>5. Duree de conservation</h2>
      <p>
        Les donnees de jeu sont conservees tant que le compte Circles est actif. Les transactions on-chain
        sont par nature publiques et perennes. Les logs serveur sont effaces apres 90 jours.
      </p>

      <h2>6. Droits de l'utilisateur (RGPD)</h2>
      <ul>
        <li>Droit d'acces aux donnees</li>
        <li>Droit de rectification</li>
        <li>Droit a l'effacement (hors donnees on-chain, non modifiables)</li>
        <li>Droit de limitation du traitement</li>
        <li>Droit d'opposition</li>
        <li>Droit a la portabilite</li>
      </ul>
      <p>
        Pour exercer ces droits, contacter le DAO via le support.
      </p>

      <h2>7. Destinataires</h2>
      <p>
        Les donnees ne sont partagees avec aucun tiers commercial. Les fournisseurs techniques (hebergement
        Vercel, base de donnees Neon, RPC Gnosis) peuvent traiter les donnees sous contrat.
      </p>

      <h2>8. Transferts hors UE</h2>
      <p>
        Certains fournisseurs techniques peuvent etre bases hors UE. Les transferts sont encadres par les clauses
        contractuelles types de la Commission europeenne.
      </p>

      <h2>9. Contact delegue a la protection des donnees</h2>
      <p>
        A designer. Consultation juridique requise pour la designation d'un DPO selon l'activite du DAO.
      </p>
    </>
  );
}

function PrivacyContentEn({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.privacyTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]}: 2026-04-20
      </p>

      <h2>1. Data controller</h2>
      <p>
        Data processing is handled by the NF Society DAO. Contact details available via the official Telegram
        channel or the platform's support button.
      </p>

      <h2>2. Data collected</h2>
      <ul>
        <li>Circles wallet address (public on-chain identifier)</li>
        <li>Game history and results (stored in PostgreSQL + on-chain)</li>
        <li>Circles profile name and avatar (fetched via the Circles protocol)</li>
        <li>Minimal technical data (anonymized server logs, errors)</li>
        <li>No civil identification data is collected</li>
      </ul>

      <h2>3. Purposes</h2>
      <ul>
        <li>Game operation and on-chain payments</li>
        <li>Public statistics and leaderboards (pseudonymized)</li>
        <li>Abuse, fraud and malicious behavior detection</li>
        <li>User support via Telegram</li>
      </ul>

      <h2>4. Legal basis</h2>
      <p>
        Service performance (ToS) and legitimate interest of the DAO in fighting fraud.
      </p>

      <h2>5. Retention period</h2>
      <p>
        Game data is retained as long as the Circles account is active. On-chain transactions are by nature
        public and permanent. Server logs are deleted after 90 days.
      </p>

      <h2>6. User rights (GDPR)</h2>
      <ul>
        <li>Right of access to data</li>
        <li>Right of rectification</li>
        <li>Right to erasure (excluding on-chain data, which cannot be modified)</li>
        <li>Right to restrict processing</li>
        <li>Right to object</li>
        <li>Right to data portability</li>
      </ul>
      <p>
        To exercise these rights, contact the DAO via support.
      </p>

      <h2>7. Recipients</h2>
      <p>
        Data is not shared with any commercial third party. Technical providers (Vercel hosting, Neon database,
        Gnosis RPC) may process data under contract.
      </p>

      <h2>8. Transfers outside the EU</h2>
      <p>
        Some technical providers may be based outside the EU. Transfers are framed by standard contractual clauses
        from the European Commission.
      </p>

      <h2>9. Data Protection Officer contact</h2>
      <p>
        To be designated. Legal consultation required for DPO designation based on DAO activity.
      </p>
    </>
  );
}

const CONTENT: Record<Locale, (props: { t: T; locale: Locale }) => JSX.Element> = {
  fr: PrivacyContentFr,
  en: PrivacyContentEn,
};

export default function PrivacyPage() {
  const { locale } = useLocale();
  const t = translations.legal;
  const Content = CONTENT[locale];
  return <Content t={t} locale={locale} />;
}
