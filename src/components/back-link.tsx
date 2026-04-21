"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

interface BackLinkProps {
  fallback?: string;
  className?: string;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function BackLink({ fallback = "/home", className, children, onClick }: BackLinkProps) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
