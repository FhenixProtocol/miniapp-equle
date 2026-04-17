import { useState, useEffect, useCallback } from "react";
import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../../contract/contract";
import { useGameStore } from "../store/gameStore";
import { useGameSync } from "./useGameSync";
import { useCofheStore } from "../store/cofheStore";
import { cofheClient } from "../services/cofhe-client";

type SyncStatus = "loading" | "synced" | "needs-sync" | "error";

export function useGameStateValidator(
  address?: `0x${string}`,
  currentGameId?: number | null
) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    gameState,
    walletAddress,
    isGameStateSynced,
    clearGameState,
    setWalletAddress,
  } = useGameStore();
  const { isInitialized: isCofheInitialized } = useCofheStore();
  const { syncGameStateFromContract } = useGameSync(address, currentGameId);

  // Contract hook to fetch current player state
  const { refetch: refetchPlayerGameState } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: "getPlayerGameState",
    args:
      currentGameId !== null && currentGameId !== undefined && address
        ? [BigInt(currentGameId), address]
        : undefined,
    query: { enabled: false }, // Manual fetching only
  });

  // Smart wallet address management - only clear when different address connects
  useEffect(() => {
    if (address && walletAddress && address !== walletAddress) {
      // Different address connected - clear state and start fresh
      clearGameState();
      setWalletAddress(address);
      setSyncStatus("needs-sync");
      setError(null);
    } else if (address && !walletAddress) {
      // First connection or same address reconnecting - just set the address
      setWalletAddress(address);
    }
  }, [address, walletAddress]);

  // Clear game state when game ID changes
  useEffect(() => {
    if (
      currentGameId !== null &&
      gameState &&
      gameState.gameId !== currentGameId
    ) {
      clearGameState();
      setSyncStatus("needs-sync");
      setError(null);
    }
  }, [currentGameId, gameState, clearGameState]);

  const validateAndSync = useCallback(async () => {
    if (!address || currentGameId === null || currentGameId === undefined) {
      setSyncStatus("loading");
      return;
    }

    // Check if CoFHE is initialized before attempting any sync operations
    if (!isCofheInitialized) {
      setSyncStatus("loading");
      return;
    }

    // Check if CoFHE permit is available
    try {
      const active = cofheClient.permits.getActivePermit();
      if (!active) {
        setSyncStatus("loading");
        return;
      }
    } catch {
      setSyncStatus("loading");
      return;
    }

    setIsValidating(true);
    setError(null);
    setSyncStatus("loading");

    try {
      // Fetch current on-chain state
      const { data: result } = (await refetchPlayerGameState({
        args: [BigInt(currentGameId), address],
      } as any)) as unknown as { data: readonly [number, boolean] };

      if (!result) {
        throw new Error("Failed to fetch on-chain game state");
      }

      const [onChainCurrentAttempt, onChainHasWon] = result;
      const onChainState = {
        gameId: currentGameId,
        currentAttempt: Number(onChainCurrentAttempt),
        hasWon: Boolean(onChainHasWon),
      };

      // Check if local state matches on-chain state
      const isLocalStateSynced =
        gameState &&
        gameState.gameId === onChainState.gameId &&
        gameState.currentAttempt === onChainState.currentAttempt &&
        gameState.hasWon === onChainState.hasWon;

      if (isLocalStateSynced && isGameStateSynced) {
        setSyncStatus("synced");
      } else {
        setSyncStatus("needs-sync");

        // Trigger sync from contract
        await syncGameStateFromContract();

        // Check if sync was successful by verifying the updated game state
        const { gameState: updatedGameState } = useGameStore.getState();
        if (updatedGameState && updatedGameState.gameId === currentGameId) {
          setSyncStatus("synced");
        } else {
          console.error("Sync completed but no valid game state found");
          setError("Failed to load game data. Please try refreshing.");
          setSyncStatus("error");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setSyncStatus("error");
    } finally {
      setIsValidating(false);
    }
  }, [
    address,
    currentGameId,
    gameState,
    isGameStateSynced,
    isCofheInitialized,
    refetchPlayerGameState,
    syncGameStateFromContract,
  ]);

  // No auto-validation - validation will be triggered manually by the page component

  // Handle sync state changes from other components
  useEffect(() => {
    if (isGameStateSynced && syncStatus !== "synced") {
      setSyncStatus("synced");
    }
  }, [isGameStateSynced, syncStatus]);

  return {
    syncStatus,
    isValidating,
    error,
    validateAndSync,
  };
}
