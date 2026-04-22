"use client";

import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type Locale = "fr" | "en";
type T = typeof translations.legal;

function TermsContentFr({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.termsTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]} : 2026-04-20
      </p>

      <h2>1. Objet</h2>
      <p>
        Les presentes Conditions Generales d'Utilisation (CGU) regissent l'acces et l'utilisation
        de la plateforme NF Society, service communautaire du DAO NF Society deploye sur Gnosis Chain
        via le protocole Circles.
      </p>

      <h2>2. Acceptation</h2>
      <p>
        En accedant a la plateforme, l'utilisateur accepte sans reserve les presentes CGU.
        En cas de desaccord, il doit cesser immediatement tout usage de NF Society.
      </p>

      <h2>3. Description du service</h2>
      <p>
        NF Society propose des jeux multijoueurs et des jeux de chance utilisant la monnaie CRC du protocole Circles.
        Les paiements et payouts sont executes on-chain via des smart contracts Safe + Roles Modifier,
        sans custody des fonds par l'editeur.
      </p>

      <h2>4. Conditions d'acces</h2>
      <ul>
        <li>Etre majeur selon la legislation de sa juridiction de residence</li>
        <li>Disposer d'un wallet Circles verifie pour participer aux jeux avec mise reelle</li>
        <li>Respecter les lois locales en matiere de jeux d'argent en ligne</li>
        <li>Le mode demo ne necessite ni wallet ni inscription et reste accessible a tous</li>
      </ul>

      <h2>5. Responsabilite de l'utilisateur</h2>
      <p>
        L'utilisateur joue sous sa propre responsabilite. Il lui appartient de verifier la legalite des jeux
        d'argent en ligne dans sa juridiction avant toute mise en CRC.
      </p>

      <h2>6. Limitation de responsabilite</h2>
      <p>
        NF Society est fourni "en l'etat" sans garantie d'aucune sorte. Le DAO ne saurait etre tenu responsable
        des pertes liees a l'utilisation de la plateforme, aux fluctuations du CRC, aux bugs des smart contracts,
        ou a toute indisponibilite du service.
      </p>

      <h2>7. Gouvernance</h2>
      <p>
        Les parametres economiques (house edge, commissions, distribution de la tresorerie) sont fixes par vote
        du DAO. Les utilisateurs peuvent participer aux votes selon les modalites decrites dans la documentation
        de gouvernance.
      </p>

      <h2>8. Modifications</h2>
      <p>
        Les presentes CGU peuvent etre modifiees a tout moment. Les utilisateurs sont invites a les consulter
        regulierement. La date de derniere mise a jour figure en haut du document.
      </p>

      <h2>9. Droit applicable</h2>
      <p>
        A definir selon la juridiction du DAO et consultation juridique.
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute question relative aux presentes CGU, contacter le DAO via le canal Telegram officiel
        ou le bouton de support disponible sur la plateforme.
      </p>
    </>
  );
}

function TermsContentEn({ t, locale }: { t: T; locale: Locale }) {
  return (
    <>
      <h1>{t.termsTitle[locale]}</h1>
      <p className="text-sm text-ink/50 dark:text-white/50">
        {t.lastUpdated[locale]}: 2026-04-20
      </p>

      <h2>1. Purpose</h2>
      <p>
        These Terms of Service govern access to and use of the NF Society platform, a community service
        of the NF Society DAO deployed on Gnosis Chain via the Circles protocol.
      </p>

      <h2>2. Acceptance</h2>
      <p>
        By accessing the platform, users accept these Terms without reservation.
        If they disagree, they must immediately stop using NF Society.
      </p>

      <h2>3. Service description</h2>
      <p>
        NF Society offers multiplayer games and chance games using the CRC currency of the Circles protocol.
        Payments and payouts are executed on-chain via Safe + Roles Modifier smart contracts, without fund custody
        by the operator.
      </p>

      <h2>4. Access conditions</h2>
      <ul>
        <li>Be of legal age under the legislation of the user's jurisdiction</li>
        <li>Have a verified Circles wallet to participate in real-money games</li>
        <li>Comply with local laws regarding online gambling</li>
        <li>Demo mode requires neither wallet nor signup and stays accessible to anyone</li>
      </ul>

      <h2>5. User responsibility</h2>
      <p>
        Users play at their own risk. It is their responsibility to verify the legality of online gambling
        in their jurisdiction before any CRC bet.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        NF Society is provided "as is" without warranty of any kind. The DAO cannot be held liable for
        losses related to platform use, CRC fluctuations, smart contract bugs, or service unavailability.
      </p>

      <h2>7. Governance</h2>
      <p>
        Economic parameters (house edge, commissions, treasury distribution) are set by DAO vote.
        Users can participate in votes according to the procedures described in the governance documentation.
      </p>

      <h2>8. Changes</h2>
      <p>
        These Terms may be modified at any time. Users are invited to consult them regularly.
        The last update date appears at the top of the document.
      </p>

      <h2>9. Governing law</h2>
      <p>
        To be defined according to DAO jurisdiction and legal consultation.
      </p>

      <h2>10. Contact</h2>
      <p>
        For any question regarding these Terms, contact the DAO via the official Telegram channel
        or the support button available on the platform.
      </p>
    </>
  );
}

const CONTENT: Record<Locale, (props: { t: T; locale: Locale }) => JSX.Element> = {
  fr: TermsContentFr,
  en: TermsContentEn,
};

export default function TermsPage() {
  const { locale } = useLocale();
  const t = translations.legal;
  const Content = CONTENT[locale];
  return <Content t={t} locale={locale} />;
}
