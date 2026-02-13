import { Badge } from "@/components/ui/badge";
import type { CirclesTransferEvent } from "@/lib/circles";
import type { PaymentWatchStatus } from "@/hooks/use-payment-watcher";

const statusLabel: Record<PaymentWatchStatus, { label: string; variant: "neutral" | "waiting" | "success" | "error" }> = {
  idle: { label: "En attente", variant: "neutral" },
  waiting: { label: "Recherche...", variant: "waiting" },
  confirmed: { label: "Confirmé", variant: "success" },
  error: { label: "Erreur", variant: "error" }
};

function formatCRC(weiValue: string): string {
  try {
    const val = BigInt(weiValue);
    const whole = val / BigInt("1000000000000000000");
    return `${whole} CRC`;
  } catch {
    return "? CRC";
  }
}

export function PaymentStatus({
  status,
  payment,
  error
}: {
  status: PaymentWatchStatus;
  payment: CirclesTransferEvent | null;
  error: string | null;
}) {
  const display = statusLabel[status];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Statut du paiement</p>
        <Badge variant={display.variant}>{display.label}</Badge>
      </div>
      {payment ? (
        <div className="space-y-2 text-xs text-ink/70">
          <div className="flex items-center justify-between">
            <span>Transaction</span>
            <span className="font-mono">{payment.transactionHash.slice(0, 12)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span>De</span>
            <span className="font-mono">{payment.sender.slice(0, 10)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Vers</span>
            <span className="font-mono">{payment.to.slice(0, 10)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Montant</span>
            <span className="font-mono">{formatCRC(payment.value)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink/60">
          {status === "idle"
            ? "Cliquez sur Vérifier pour chercher votre paiement."
            : status === "error"
            ? error || "La vérification a échoué."
            : "Recherche d'un paiement correspondant..."}
        </p>
      )}
    </div>
  );
}
