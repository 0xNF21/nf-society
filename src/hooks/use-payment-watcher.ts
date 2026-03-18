import { useEffect, useState } from "react";
import { checkPaymentReceived, type CirclesTransferEvent } from "@/lib/circles";

export type PaymentWatchStatus = "idle" | "waiting" | "confirmed" | "error";

interface PaymentWatchOptions {
  enabled: boolean;
  dataValue: string;
  minAmountCRC: number;
  recipientAddress?: string;
  intervalMs?: number;
  excludeTxHashes?: string[];
}

export function usePaymentWatcher({
  enabled,
  dataValue,
  minAmountCRC,
  recipientAddress,
  intervalMs = 5000,
  excludeTxHashes = [],
}: PaymentWatchOptions) {
  const [status, setStatus] = useState<PaymentWatchStatus>("idle");
  const [payment, setPayment] = useState<CirclesTransferEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable key: only restart the effect when hashes actually change
  const excludeKey = excludeTxHashes.join(",");

  useEffect(() => {
    setPayment(null);
    setError(null);

    if (!enabled || !minAmountCRC) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    const knownHashes = new Set<string>(excludeTxHashes.map(h => h.toLowerCase()));

    const poll = async () => {
      if (cancelled) return;
      setStatus(prev => (prev === "confirmed" ? prev : "waiting"));

      try {
        const found = await checkPaymentReceived(dataValue, minAmountCRC, recipientAddress, knownHashes);

        if (cancelled) return;

        if (found) {
          setPayment(found);
          setStatus("confirmed");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Payment check failed");
        setStatus("error");
      }

      if (!cancelled) {
        timeoutId = setTimeout(poll, intervalMs);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dataValue, minAmountCRC, recipientAddress, intervalMs, excludeKey]);

  return { status, payment, error };
}
