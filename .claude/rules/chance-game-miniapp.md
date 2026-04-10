---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/page.tsx"
---

# Mini App dual payment flow — jeux de chance / casino

Quand tu crees un nouveau jeu de type chance (loterie, lootbox, scratch, etc.) qui a un paiement CRC, tu DOIS supporter le mode Mini App Circles en plus du mode standalone (QR + lien Gnosis).

**OBLIGATOIRE — i18n** : Ne JAMAIS hardcoder des textes en francais ou anglais dans les composants. Toujours utiliser les cles i18n de `src/lib/i18n.ts` via `translations.{section}[locale]`. Ajouter une section dediee dans i18n pour chaque nouveau jeu.

**OBLIGATOIRE — Mode demo** : Chaque nouveau jeu chance DOIT avoir un mode demo (client-only, sans paiement). Pattern :
1. Le composant principal importe `useDemo` de `@/components/demo-provider`
2. Si `isDemo` → affiche le `DemoGame` (logique client pure, pas d'API)
3. La page serveur `[slug]/page.tsx` detecte les slugs `DEMO-*` et retourne une config fake (pas de query DB)
4. La page `/chance` redirige vers `/jeu/DEMO-slug` quand `isDemo` est true
5. PAS d'XP en mode demo — ne JAMAIS appeler `addXp()` en demo

## Pattern obligatoire

### 1. Import
```typescript
import { useMiniApp } from "@/components/miniapp-provider";
```

### 2. Hook dans le composant
```typescript
const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
const tm = translations.miniapp;

const [miniAppPaying, setMiniAppPaying] = useState(false);
const [miniAppError, setMiniAppError] = useState<string | null>(null);
```

### 3. Handler de paiement Mini App
```typescript
async function handleMiniAppPay() {
  setMiniAppPaying(true);
  setMiniAppError(null);
  try {
    const data = `{gameType}:{gameId}`;
    await sendPayment(recipientAddress, amountCrc, data);
    // Declencher le scan apres 2s
    setTimeout(scanFunction, 2000);
  } catch (err: any) {
    setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
  } finally {
    setMiniAppPaying(false);
  }
}
```

### 4. Utiliser le composant ChancePayment

Pour les jeux de type chance (lottery, lootbox, et futurs jeux casino), utiliser le composant generique `<ChancePayment>` qui gere automatiquement le dual flow Mini App / standalone :

```tsx
import { ChancePayment } from "@/components/chance-payment";

<ChancePayment
  recipientAddress={game.recipientAddress}
  amountCrc={game.priceCrc}
  gameType="nom-du-jeu"
  gameId={game.slug}
  accentColor={accentColor}
  payLabel={t.payWithCircles[locale]}
  onPaymentInitiated={async () => { await scanNow(); setWatchingPayment(true); }}
  onScan={scanNow}
  scanning={scanning}
  paymentStatus={showConfirmed ? "confirmed" : watchingPayment ? (paymentStatus === "error" ? "error" : "watching") : "idle"}
  qrLabel={t.scanQr[locale]}
  playerToken={tokenRef.current}
/>
```

Le composant gere automatiquement :
- Mode Mini App : wallet indicator + bouton "Payer X CRC" + succes/erreur
- Mode standalone : lien Gnosis + boutons copier/QR + status paiement
- Generation QR code (uniquement en standalone)

**NE PAS** implementer le flow paiement manuellement dans les jeux chance — toujours utiliser `<ChancePayment>`.

## OBLIGATOIRE — playerToken (identification joueur)

Chaque jeu chance DOIT utiliser un `playerToken` pour identifier le joueur qui a paye. Cela permet :
- De retrouver ses resultats meme apres fermeture de page
- D'eviter la confusion quand 2 joueurs paient en meme temps
- Pour les jeux interactifs (blackjack) : anti-triche sur les actions

### Pattern front-end
```typescript
import { usePlayerToken } from "@/hooks/use-player-token";

const tokenRef = usePlayerToken("nom-du-jeu", game.slug);

// 1. Encoder le token dans le dataValue (payment watcher)
const dataValue = encodeGameData({ game: "nom-du-jeu", id: game.slug, v: 1, t: tokenRef.current || undefined });

// 2. Passer le token au ChancePayment
<ChancePayment ... playerToken={tokenRef.current} />

// 3. Passer le token aux API calls
fetch(`/api/scan?gameId=${id}&token=${tokenRef.current}`)
fetch(`/api/results?gameId=${id}&token=${tokenRef.current}`)

// 4. Pour les jeux interactifs, passer le token aux actions
body: JSON.stringify({ action, playerToken: tokenRef.current })
```

### Pattern back-end
```typescript
// Scan API : extraire et stocker le token
const playerToken = payment.gameData?.t || null;
await db.insert(table).values({ ...data, playerToken });

// GET API : filtrer par token
const token = req.nextUrl.searchParams.get("token");
// Si token fourni, filtrer les resultats du joueur

// Action API (jeux interactifs) : verifier le token
if (hand.playerToken) {
  if (!playerToken || playerToken !== hand.playerToken) {
    return NextResponse.json({ error: "Invalid player token" }, { status: 401 });
  }
}
```

### Schema DB
Chaque table de resultats DOIT avoir une colonne `playerToken: text("player_token")`.

## Regles
- Le QR code ne doit PAS etre genere en mode Mini App (gere par ChancePayment)
- Le scan blockchain reste identique — le serveur detecte la tx on-chain normalement
- Toujours inclure le `data` dans sendPayment pour identifier le paiement
- Le flow standalone (QR + lien) doit rester intact quand on n'est PAS dans l'iframe

## PNL Card (resultat partageable)

Apres le resultat d'un jeu chance (lootbox reward, lottery win), TOUJOURS afficher une `<PnlCard>` :

```tsx
import { PnlCard } from "@/components/pnl-card";

<PnlCard
  gameType="lootbox"
  result="reward"
  gameLabel="Lootbox Bronze"
  rewardCrc={rewardAmount}
  betCrc={priceCrc}
  gainCrc={rewardAmount - priceCrc}
  playerName={playerName}
  tier="LEGENDARY"
  tierColor="#EF4444"
  date={new Date().toLocaleDateString()}
  locale={locale}
/>
```

La PnlCard genere une image PNG telechargeable/partageable. TOUJOURS l'inclure apres le resultat de chaque jeu chance.

## Composants existants avec Mini App
- `src/components/game-payment.tsx` — jeux multijoueur (deja integre)
- `src/components/chance-payment.tsx` — jeux chance generique (lottery, lootbox, futurs jeux casino)
- `src/components/pnl-card.tsx` — carte PNL partageable (tous les jeux)
- `src/components/exchange-section.tsx` — echange CRC (flow inline custom)
- `src/components/daily-modal.tsx` — recompense quotidienne (flow inline custom)
- `src/app/shop/page.tsx` — boutique auth par paiement (flow inline custom)
