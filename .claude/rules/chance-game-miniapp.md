---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/page.tsx"
---

# Mini App dual payment flow — jeux de chance / casino

Quand tu crees un nouveau jeu de type chance (loterie, lootbox, scratch, etc.) qui a un paiement CRC, tu DOIS supporter le mode Mini App Circles en plus du mode standalone (QR + lien Gnosis).

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

### 4. UI conditionnelle
```tsx
{isMiniApp && walletAddress ? (
  <>
    <Button onClick={handleMiniAppPay} disabled={miniAppPaying}>
      {miniAppPaying ? (
        <><Loader2 className="animate-spin" />{tm.paying[locale]}</>
      ) : (
        tm.payBtn[locale].replace("{amount}", String(amount))
      )}
    </Button>
    {miniAppError && <p className="text-xs text-red-500">{miniAppError}</p>}
  </>
) : (
  // Flow standalone existant : lien Gnosis + QR code + copier
)}
```

## Regles
- Le QR code ne doit PAS etre genere en mode Mini App (`if (isMiniApp) return;`)
- Le scan blockchain reste identique — le serveur detecte la tx on-chain normalement
- Toujours inclure le `data` dans sendPayment pour identifier le paiement
- Le flow standalone (QR + lien) doit rester intact quand on n'est PAS dans l'iframe

## Composants existants avec Mini App
- `src/components/game-payment.tsx` — jeux multijoueur (deja integre)
- `src/components/lottery-page.tsx` — loteries
- `src/components/lootbox-page.tsx` — lootbox
- `src/components/exchange-section.tsx` — echange CRC
- `src/components/daily-modal.tsx` — recompense quotidienne
- `src/app/shop/page.tsx` — boutique (auth par paiement)
