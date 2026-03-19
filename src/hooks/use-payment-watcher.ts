import { useEffect, useRef, useState } from "react";
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

  // Ref so the poll closure always reads the latest excludeTxHashes
  // without causing the effect to restart on every list change
  const excludeRef = useRef(excludeTxHashes);
  useEffect(() => { excludeRef.current = excludeTxHashes; });

  useEffect(() => {
    setPayment(null);
    setError(null);
    if (!enabled || !minAmountCRC) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (cancelled) return;
      setStatus((prev) => (prev === "confirmed" ? prev : "waiting"));

      try {
        const excludeSet = new Set(excludeRef.current.map((h) => h.toLowerCase()));
        const found = await checkPaymentReceived(dataValue, minAmountCRC, recipientAddress, excludeSet);

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
  }, [enabled, dataValue, minAmountCRC, recipientAddress, intervalMs]);

  return { status, payment, error };
}
