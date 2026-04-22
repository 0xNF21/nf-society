"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Gamepad2, Star, Trophy, Gift, Dice5, ShoppingBag, HelpCircle } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { isFr } from "@/lib/i18n";

function Section({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-ink/[0.02] dark:hover:bg-white/[0.02] transition-colors">
        <div className="h-10 w-10 rounded-xl bg-marine/10 flex items-center justify-center shrink-0">{icon}</div>
        <span className="text-base font-bold text-ink dark:text-white flex-1">{title}</span>
        <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 space-y-3 text-sm text-ink/70 dark:text-white/70 leading-relaxed">{children}</div>}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-ink dark:text-white">{children}</span>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2"><span className="text-marine shrink-0">•</span><p>{children}</p></div>;
}

export default function DocsPage() {
  const { locale } = useLocale();
  const fr = isFr(locale);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="space-y-2">
          <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> {fr ? "Accueil" : "Home"}
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-marine/10 flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-marine" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-ink dark:text-white">Documentation</h1>
              <p className="text-xs text-ink/50 dark:text-white/50">{fr ? "Tout savoir sur NF Society" : "Everything about NF Society"}</p>
            </div>
          </div>
        </div>

        {/* What is NF Society */}
        <Section title={fr ? "Qu'est-ce que NF Society ?" : "What is NF Society?"} icon={<HelpCircle className="w-5 h-5 text-marine" />} defaultOpen={true}>
          <P>{fr
            ? "NF Society est une plateforme communautaire de jeux on-chain sur Gnosis Chain. Tous les paiements se font en CRC (Circles Protocol). Jouez, pariez, gagnez des CRC et montez dans le classement !"
            : "NF Society is a community gaming platform on Gnosis Chain. All payments use CRC (Circles Protocol). Play, bet, win CRC and climb the leaderboard!"
          }</P>
          <Bullet>{fr ? <><B>Blockchain</B> : Gnosis Chain</> : <><B>Blockchain</B>: Gnosis Chain</>}</Bullet>
          <Bullet>{fr ? <><B>Token</B> : CRC (Circles Protocol)</> : <><B>Token</B>: CRC (Circles Protocol)</>}</Bullet>
          <Bullet>{fr ? <><B>Paiements</B> : via l&apos;app Gnosis (QR code ou lien)</> : <><B>Payments</B>: via Gnosis app (QR code or link)</>}</Bullet>
        </Section>

        {/* How to play */}
        <Section title={fr ? "Comment jouer ?" : "How to play?"} icon={<Gamepad2 className="w-5 h-5 text-marine" />}>
          <P>{fr ? "1. Choisissez un jeu et une mise en CRC" : "1. Choose a game and bet amount in CRC"}</P>
          <P>{fr ? "2. Payez via l'app Gnosis (scannez le QR code ou cliquez le lien)" : "2. Pay via Gnosis app (scan QR code or click the link)"}</P>
          <P>{fr ? "3. Partagez le code de la partie a votre adversaire" : "3. Share the game code with your opponent"}</P>
          <P>{fr ? "4. Jouez ! Le gagnant recoit les mises des 2 joueurs (moins la commission)" : "4. Play! Winner takes both bets (minus commission)"}</P>
          <div className="rounded-xl bg-marine/5 dark:bg-marine/10 p-3 border border-marine/10">
            <P><B>{fr ? "Commission" : "Commission"}</B> : {fr ? "5% sur les jeux multijoueur. Le gagnant recoit 95% du pot." : "5% on multiplayer games. Winner gets 95% of the pot."}</P>
          </div>
        </Section>

        {/* Games */}
        <Section title={fr ? "Les jeux" : "Games"} icon={<Dice5 className="w-5 h-5 text-marine" />}>
          <div className="space-y-3">
            <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 p-3">
              <P><B>❌ {fr ? "Morpion" : "Tic-Tac-Toe"}</B></P>
              <P>{fr ? "Alignez 3 symboles pour gagner. Tour par tour." : "Align 3 symbols to win. Turn-based."}</P>
            </div>
            <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 p-3">
              <P><B>🃏 Memory</B></P>
              <P>{fr ? "Trouvez toutes les paires. 3 difficultes. Le joueur avec le plus de paires gagne." : "Find all pairs. 3 difficulties. Player with most pairs wins."}</P>
            </div>
            <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 p-3">
              <P><B>⚓ Relics</B></P>
              <P>{fr ? "Bataille navale d'artefacts. Placez vos reliques et coulez celles de l'adversaire." : "Artifact battleship. Place your relics and sink your opponent's."}</P>
            </div>
            <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 p-3">
              <P><B>♟️ {fr ? "Dames" : "Checkers"}</B></P>
              <P>{fr ? "Jeu de dames classique. Captures obligatoires. Pions deviennent dames." : "Classic checkers. Mandatory captures. Pieces become kings."}</P>
            </div>
            <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 p-3">
              <P><B>✊ {fr ? "Pierre-Feuille-Ciseaux" : "Rock-Paper-Scissors"}</B></P>
              <P>{fr ? "Best of 3 ou 5. Coups simultanes. Pierre bat Ciseaux, Ciseaux bat Feuille, Feuille bat Pierre." : "Best of 3 or 5. Simultaneous moves. Rock beats Scissors, Scissors beats Paper, Paper beats Rock."}</P>
            </div>
          </div>
        </Section>

        {/* XP System */}
        <Section title={fr ? "Systeme XP et Niveaux" : "XP & Levels"} icon={<Star className="w-5 h-5 text-marine" />}>
          <P>{fr ? "Gagnez de l'XP en jouant. Montez de niveau pour debloquer des avantages dans le shop." : "Earn XP by playing. Level up to unlock shop benefits."}</P>
          <P><B>{fr ? "Comment gagner de l'XP :" : "How to earn XP:"}</B></P>
          <Bullet>{fr ? "Gagner une partie : 15-20 XP" : "Win a game: 15-20 XP"}</Bullet>
          <Bullet>{fr ? "Perdre une partie : 5 XP" : "Lose a game: 5 XP"}</Bullet>
          <Bullet>{fr ? "Check-in quotidien : 3 XP" : "Daily check-in: 3 XP"}</Bullet>
          <Bullet>{fr ? "Scratch/Spin quotidien : 5 XP" : "Daily scratch/spin: 5 XP"}</Bullet>
          <Bullet>{fr ? "Ouvrir une lootbox : 10-100 XP" : "Open a lootbox: 10-100 XP"}</Bullet>
          <Bullet>{fr ? "Streak 7 jours : +50 XP bonus" : "7-day streak: +50 XP bonus"}</Bullet>
          <P><B>{fr ? "10 niveaux" : "10 levels"}</B> : {fr ? "de 0 a 20,000 XP" : "from 0 to 20,000 XP"}</P>
        </Section>

        {/* Daily */}
        <Section title={fr ? "Tirage Quotidien" : "Daily Draw"} icon={<Gift className="w-5 h-5 text-marine" />}>
          <P>{fr ? "Chaque jour, payez 1 CRC pour jouer au scratch card et a la roue !" : "Every day, pay 1 CRC to play the scratch card and spin wheel!"}</P>
          <P><B>{fr ? "Scratch Card" : "Scratch Card"}</B></P>
          <Bullet>{fr ? "33% de chance d'etre rembourse (1 CRC)" : "33% chance of refund (1 CRC)"}</Bullet>
          <Bullet>{fr ? "Gagnez jusqu'a 5 CRC ou du XP" : "Win up to 5 CRC or XP"}</Bullet>
          <P><B>{fr ? "Roue" : "Spin Wheel"}</B></P>
          <Bullet>{fr ? "Gagnez des CRC, du XP ou des bonus" : "Win CRC, XP or bonuses"}</Bullet>
          <Bullet>{fr ? "7 segments avec des gains differents" : "7 segments with different rewards"}</Bullet>
        </Section>

        {/* Badges */}
        <Section title={fr ? "Badges" : "Badges"} icon={<Trophy className="w-5 h-5 text-marine" />}>
          <P>{fr ? "Debloquez des badges en accomplissant des objectifs. Certains badges sont secrets !" : "Unlock badges by completing objectives. Some badges are secret!"}</P>
          <P><B>{fr ? "Categories :" : "Categories:"}</B></P>
          <Bullet>{fr ? "🎮 Jeu — lies aux jeux multijoueur" : "🎮 Game — related to multiplayer games"}</Bullet>
          <Bullet>{fr ? "📊 Activite — lies a l'activite generale" : "📊 Activity — related to general activity"}</Bullet>
          <Bullet>{fr ? "🎉 Evenement — evenements speciaux" : "🎉 Event — special events"}</Bullet>
          <Bullet>{fr ? "🔒 Secret — caches jusqu'au deblocage" : "🔒 Secret — hidden until unlocked"}</Bullet>
        </Section>

        {/* Shop */}
        <Section title={fr ? "Boutique XP" : "XP Shop"} icon={<ShoppingBag className="w-5 h-5 text-marine" />}>
          <P>{fr ? "Depensez vos XP dans la boutique pour obtenir des avantages :" : "Spend your XP in the shop for benefits:"}</P>
          <Bullet>{fr ? "Boosts XP (x2 pendant 24h)" : "XP boosts (x2 for 24h)"}</Bullet>
          <Bullet>{fr ? "Coupons de remboursement" : "Refund coupons"}</Bullet>
          <Bullet>{fr ? "Badges cosmetiques" : "Cosmetic badges"}</Bullet>
          <Bullet>{fr ? "Echange XP contre CRC" : "Exchange XP for CRC"}</Bullet>
          <P>{fr ? "Certains articles necessitent un niveau minimum." : "Some items require a minimum level."}</P>
        </Section>

        {/* Leaderboard */}
        <Section title={fr ? "Classement" : "Leaderboard"} icon={<Trophy className="w-5 h-5 text-marine" />}>
          <P>{fr ? "Comparez-vous aux autres joueurs !" : "Compare yourself to other players!"}</P>
          <Bullet>{fr ? "Top XP — par experience totale" : "Top XP — by total experience"}</Bullet>
          <Bullet>{fr ? "Top Victoires — nombre de wins" : "Top Wins — number of victories"}</Bullet>
          <Bullet>{fr ? "Win Rate — pourcentage de victoires (min 5 parties)" : "Win Rate — win percentage (min 5 games)"}</Bullet>
          <Bullet>{fr ? "CRC Gagnes — total CRC gagnes en jeux" : "CRC Won — total CRC won in games"}</Bullet>
          <P>{fr ? "Filtrez par periode (tout, ce mois, cette semaine) et par jeu." : "Filter by period (all time, this month, this week) and by game."}</P>
        </Section>
      </div>
    </main>
  );
}
