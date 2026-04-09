"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  isMiniApp as detectMiniApp,
  requestAddress,
  onWalletChange,
  onAppData,
  sendCrcTransfer,
  cleanup,
} from "@/lib/miniapp-bridge";

interface MiniAppContextValue {
  /** True if running inside the Circles Mini App iframe */
  isMiniApp: boolean;
  /** Wallet address from the Circles host (lowercase, null if not connected) */
  walletAddress: string | null;
  /**
   * Send a CRC payment via the Circles host wallet.
   * Only available in Mini App mode.
   * @returns transaction hashes
   */
  sendPayment: (to: string, amountCrc: number, data?: string) => Promise<string[]>;
}

const MiniAppContext = createContext<MiniAppContextValue>({
  isMiniApp: false,
  walletAddress: null,
  sendPayment: () => Promise.reject("Not in Mini App mode"),
});

const WEI_PER_CRC = BigInt("1000000000000000000");

export function MiniAppProvider({ children }: { children: React.ReactNode }) {
  const [miniApp, setMiniApp] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const isInIframe = detectMiniApp();
    setMiniApp(isInIframe);

    if (!isInIframe) return;

    // Listen for wallet changes from the host
    const unsubWallet = onWalletChange((addr) => {
      setWalletAddress(addr);
    });

    // Listen for deep link data from the host (e.g. "lootbox/bronze", "loterie/weekly")
    const unsubData = onAppData((data) => {
      // Navigate to the path received from the host
      if (data.startsWith("/")) {
        router.push(data);
      } else {
        router.push(`/${data}`);
      }
    });

    // Request the wallet address from the host
    requestAddress();

    return () => {
      unsubWallet();
      unsubData();
      cleanup();
    };
  }, [router]);

  const sendPayment = useCallback(
    async (to: string, amountCrc: number, data?: string): Promise<string[]> => {
      if (!miniApp) throw new Error("Not in Mini App mode");
      const amountWei = (BigInt(amountCrc) * WEI_PER_CRC).toString();
      return sendCrcTransfer(to, amountWei, data);
    },
    [miniApp]
  );

  return (
    <MiniAppContext.Provider value={{ isMiniApp: miniApp, walletAddress, sendPayment }}>
      {children}
    </MiniAppContext.Provider>
  );
}

export function useMiniApp() {
  return useContext(MiniAppContext);
}
