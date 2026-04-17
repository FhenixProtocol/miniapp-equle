"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { cofheClient } from "../services/cofhe-client";
import { useCofheStore } from "../store/cofheStore";
import { useGameStore } from "../store/gameStore";

export function usePermit(currentGameId?: number | null) {
  const { address, chainId } = useAccount();
  const { isInitialized: isCofheInitialized, permitVersion, bumpPermitVersion } =
    useCofheStore();
  const { clearGameState } = useGameStore();

  const [hasValidPermit, setHasValidPermit] = useState(false);
  const [isGeneratingPermit, setIsGeneratingPermit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPermit = useCallback(() => {
    if (!isCofheInitialized) {
      setHasValidPermit(false);
      return false;
    }
    try {
      const active = cofheClient.permits.getActivePermit();
      setHasValidPermit(!!active);
      return !!active;
    } catch (err) {
      setHasValidPermit(false);
      return false;
    }
  }, [isCofheInitialized]);

  const generatePermit = useCallback(async () => {
    if (!isCofheInitialized || !address || isGeneratingPermit) {
      return { success: false, error: "Not ready to generate permit" };
    }

    try {
      setIsGeneratingPermit(true);
      setError(null);

      const permitName = `equle${currentGameId ?? ""}`;
      const expirationSeconds = Math.round(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000
      );

      await cofheClient.permits.getOrCreateSelfPermit(undefined, undefined, {
        issuer: address,
        name: permitName,
        expiration: expirationSeconds,
      });

      console.log("Permit created successfully");
      setHasValidPermit(true);
      setError(null);
      bumpPermitVersion();
      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error generating permit";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsGeneratingPermit(false);
    }
  }, [
    isCofheInitialized,
    address,
    currentGameId,
    isGeneratingPermit,
    bumpPermitVersion,
  ]);

  const removePermit = useCallback(async () => {
    if (!isCofheInitialized || !chainId || !address) {
      console.log("Cannot remove permit: missing required data");
      return false;
    }

    try {
      const active = cofheClient.permits.getActivePermit();
      if (!active) {
        console.log("No active permit to remove");
        return false;
      }

      cofheClient.permits.removePermit(active.hash);
      bumpPermitVersion();
      setHasValidPermit(false);
      setError(null);
      clearGameState();

      console.log("Permit and game state removed successfully");
      return true;
    } catch (err) {
      console.error("Error removing permit:", err);
      setError("Failed to remove permit");
      return false;
    }
  }, [isCofheInitialized, chainId, address, clearGameState, bumpPermitVersion]);

  useEffect(() => {
    if (isCofheInitialized) {
      checkPermit();
    }
  }, [isCofheInitialized, permitVersion, checkPermit]);

  return {
    hasValidPermit,
    isGeneratingPermit,
    error,
    generatePermit,
    checkPermit,
    removePermit,
  };
}
