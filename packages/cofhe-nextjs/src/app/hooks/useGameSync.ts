import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { usePublicClient, useReadContract, useChainId, useAccount } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../../contract/contract";
import { useGameStore } from "../store/gameStore";
import type { GameState } from "../store/gameStore";
import { FheTypes } from "@cofhe/sdk";
import { cofheClient } from "../services/cofhe-client";
import { analyzeXorResult, extractOriginalEquation } from "../../../utils";
import { usePlayerAttempt } from "./usePlayerAttempt";

// Helpers kept outside to avoid re-creating on each render
const mapResultFeedback = (feedback: number): "equal" | "less" | "greater" => {
  if (feedback === 0) return "equal";
  if (feedback === 1) return "less";
  if (feedback === 2) return "greater";
  return "equal";
};

const buildCellStates = (
  xorValue: bigint
): ("correct" | "present" | "absent")[] => {
  const feedback = analyzeXorResult(xorValue);
  const cellStates: ("correct" | "present" | "absent")[] = [];
  for (let i = 0; i < 5; i++) {
    if (feedback.green[i]) {
      cellStates.push("correct");
    } else if (feedback.yellow[i]) {
      cellStates.push("present");
    } else {
      cellStates.push("absent");
    }
  }
  return cellStates;
};

// Hook for refetching player attempt data with automatic retry and delay
export const useRefetchPlayerAttempt = (attemptIndex: number, enabled: boolean = true) => {
  const chain = useChainId();
  const { address: account } = useAccount();
  const { refetch: refetchPlayerAttempt } = usePlayerAttempt(account, attemptIndex);
  const lastFetchTime = useRef<number>(0);
  const [attemptData, setAttemptData] = useState<[`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !account) return;

    const now = Date.now();
    if (now - lastFetchTime.current < 2000) return; // 2 second minimum interval

    const fetchAttemptData = async () => {
      if (isLoading) return;
      
      setIsLoading(true);
      
      try {
        // Wait 2 seconds on first try
        if (lastFetchTime.current === 0) {
          console.log("Initial attempt data fetch - waiting 2 seconds...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        lastFetchTime.current = now;
        
        console.log(`Fetching attempt data for index ${attemptIndex}`);
        const result = await refetchPlayerAttempt();
        
        if (result.data && Array.isArray(result.data) && result.data.length === 4) {
          const [, , equationXor, encryptedResultFeedback] = result.data as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
          
          // Check if we have valid XOR data
          if (equationXor && !/^0x0+$/.test(equationXor)) {
            console.log("Valid attempt data found");
            setAttemptData(result.data as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`]);
          }
        }
      } catch (error) {
        console.error("Error fetching attempt data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttemptData();
  }, [account, chain, attemptIndex, enabled, refetchPlayerAttempt, isLoading]);

  return { attemptData, isLoading };
};

export function useGameSync(address?: `0x${string}`, gameId?: number | null) {
  const { gameState, setGameState, setGameStateSynced } = useGameStore();
  const publicClient = usePublicClient();
  const processingRef = useRef<boolean>(false);

  // Contract hooks for player game state - get [currentAttempt, hasWon]
  const { data: playerGameStateData } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: "getPlayerGameState",
    args: address && gameId ? [BigInt(gameId), address] : undefined,
  });

  // Player attempt hook for refetching attempt data
  const { refetch: refetchPlayerAttempt } = usePlayerAttempt(
    address,
    gameId,
    gameState?.currentAttempt
  );

  // Imperative attempt reader to avoid multiple reactive hooks
  const readAttempt = useCallback(
    async (
      attemptIndex: number
    ): Promise<[`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] | null> => {
      if (
        !publicClient ||
        !address ||
        gameId === null ||
        gameId === undefined
      ) {
        return null;
      }
      try {
        const result = (await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: "getPlayerAttempt",
          args: [BigInt(gameId), address, attemptIndex],
        })) as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
        return result;
      } catch (_e) {
        return null;
      }
    },
    [publicClient, address, gameId]
  );

  // CoFHE unsealing utility. Wraps the new SDK `decryptForView` behind a result
  // envelope to minimize downstream changes in consumers.
  const unsealValue = useCallback(
    async (
      ctHash: `0x${string}`,
      fheType: FheTypes
    ): Promise<{ success: boolean; data: any; error?: unknown }> => {
      if (!address) throw new Error("Address not available");

      if (!ctHash || /^0x0+$/.test(ctHash)) {
        return {
          success: false,
          data: null,
          error: new Error("Invalid encrypted value"),
        };
      }

      try {
        const active = cofheClient.permits.getActivePermit();
        if (!active) {
          return {
            success: false,
            data: null,
            error: new Error("CoFHE permit not available"),
          };
        }
      } catch (error) {
        return { success: false, data: null, error };
      }

      try {
        const data = await cofheClient
          .decryptForView(ctHash, fheType)
          .execute();
        return { success: true, data };
      } catch (error) {
        return { success: false, data: null, error };
      }
    },
    [address]
  );

  const fetchPlayerGameState = useCallback(() => {
    if (!address) {
      console.log("No address provided for fetchPlayerGameState");
      return null;
    }

    if (!playerGameStateData) {
      console.log("No player game state data available");
      return null;
    }

    const result = playerGameStateData as unknown as [number, boolean];

    if (!Array.isArray(result) || result.length !== 2) {
      console.error("Invalid player game state data format:", result);
      return null;
    }

    const [currentAttempt, hasWon] = result;
    const playerState = {
      currentAttempt: Number(currentAttempt),
      hasWon: Boolean(hasWon),
    };

    console.log("Fetched player state:", playerState);
    return playerState;
  }, [address, playerGameStateData]);

  const rebuildGameStateFromContract = useCallback(
    async (
      targetGameId: number,
      playerState: { currentAttempt: number; hasWon: boolean }
    ) => {
      if (!address) {
        return;
      }

      try {
        const guesses = [];

        // Process all previous attempts from the contract using the direct data

        for (
          let attemptIndex = 0;
          attemptIndex < playerState.currentAttempt;
          attemptIndex++
        ) {
          try {
            // Read attempt data imperatively
            const result = await readAttempt(attemptIndex);

            if (!result || !Array.isArray(result) || result.length !== 4) {
              continue;
            }

            const [
              equationGuess,
              resultGuess,
              equationXor,
              encryptedResultFeedback,
            ] = result;

            // Check if we have valid encrypted data before attempting to unseal
            const isZero = (h: `0x${string}`) => /^0x0+$/.test(h);
            if (
              isZero(equationGuess) &&
              isZero(resultGuess) &&
              isZero(equationXor) &&
              isZero(encryptedResultFeedback)
            ) {
              continue;
            }

            // Unseal all encrypted values
            const [
              unsealedEquation,
              unsealedResult,
              unsealedXor,
              unsealedResultFeedback,
            ] = await Promise.all([
              unsealValue(equationGuess, FheTypes.Uint128),
              unsealValue(resultGuess, FheTypes.Uint8),
              unsealValue(equationXor, FheTypes.Uint128),
              unsealValue(encryptedResultFeedback, FheTypes.Uint8),
            ]);

            // Check if unsealing was successful
            if (
              !unsealedEquation?.success ||
              !unsealedResult?.success ||
              !unsealedXor?.success ||
              !unsealedResultFeedback?.success
            ) {
              continue; // Skip this attempt and continue with next one
            }

            // Process the unsealed data
            const equationString = extractOriginalEquation(
              BigInt(unsealedEquation.data || 0)
            );
            const resultValue = Number(unsealedResult.data || 0);
            const xorValue = BigInt(unsealedXor.data || 0);

            // Analyze XOR to get tile feedback
            const cellStates = buildCellStates(xorValue);

            const guess = {
              equation: equationString,
              result: resultValue.toString(),
              feedback: cellStates,
              resultFeedback: mapResultFeedback(
                Number(unsealedResultFeedback.data || 0)
              ),
            };

            guesses.push(guess);
          } catch (error) {
            break;
          }
        }

        // Create the rebuilt game state
        const rebuiltGameState = {
          gameId: targetGameId,
          currentAttempt: playerState.currentAttempt,
          guesses: guesses,
          hasWon: playerState.hasWon,
          isGameComplete: playerState.hasWon || playerState.currentAttempt >= 6,
          maxAttempts: 6,
        };

        setGameState(rebuiltGameState);
        setGameStateSynced(true);
      } catch (error) {
        console.error("Error rebuilding game state:", error);

        // Create a default game state even if rebuild fails
        const defaultGameState = {
          gameId: targetGameId,
          currentAttempt: playerState.currentAttempt,
          guesses: [],
          hasWon: playerState.hasWon,
          isGameComplete: playerState.hasWon || playerState.currentAttempt >= 6,
          maxAttempts: 6,
        };

        console.log("Setting default game state due to rebuild error");
        setGameState(defaultGameState);
        setGameStateSynced(true);
      }
    },
    [address, readAttempt, setGameState, setGameStateSynced, unsealValue]
  );

  const syncGameStateFromContract = useCallback(async () => {
    if (!address || gameId === null || gameId === undefined) {
      return;
    }

    try {
      const playerState = await fetchPlayerGameState();

      if (!playerState) {
        return;
      }

      // Check if we need to rebuild the game state
      if (
        !gameState ||
        gameState.gameId !== gameId ||
        gameState.currentAttempt !== playerState.currentAttempt ||
        gameState.hasWon !== playerState.hasWon
      ) {
        await rebuildGameStateFromContract(gameId, playerState);
      } else {
        setGameStateSynced(true);
      }
    } catch (error) {
      console.error("Error syncing game state:", error);
      // Don't throw - let the validator handle the error state
    }
  }, [
    address,
    gameId,
    gameState,
    fetchPlayerGameState,
    rebuildGameStateFromContract,
    setGameStateSynced,
  ]);

  // Enhanced helper function to poll for attempt data with better retry logic
  const pollForAttemptData = useCallback(
    async (
      attemptIndex: number,
      maxAttempts: number = 10,
      delayMs: number = 1000
    ): Promise<[`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] | null> => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          console.log(
            `Polling for attempt data (attempt ${attempt + 1}/${maxAttempts})`
          );

          // Add 2-second delay on first attempt
          if (attempt === 0) {
            console.log("Initial polling attempt - waiting 2 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          const result = await refetchPlayerAttempt();

          if (
            result.data &&
            Array.isArray(result.data) &&
            result.data.length === 4
          ) {
            const [, , equationXor] = result.data as [
              `0x${string}`,
              `0x${string}`,
              `0x${string}`,
              `0x${string}`
            ];

            // Check if we have valid XOR data
            if (equationXor && !/^0x0+$/.test(equationXor)) {
              console.log("Valid attempt data found");
              return result.data as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
            }
          }

          // Wait before next attempt (but not after the last one)
          if (attempt < maxAttempts - 1) {
            console.log(`Waiting ${delayMs}ms before next attempt...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(
            `Error polling attempt data (attempt ${attempt + 1}):`,
            error
          );
          // Wait before retrying on error (but not after the last attempt)
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      console.error("Max polling attempts reached, no valid data found");
      return null;
    },
    [refetchPlayerAttempt]
  );

  const processTransactionSuccess = useCallback(
    async (
      pendingGuess: { equation: string; result: number },
      currentGameState: GameState
    ) => {
      if (!pendingGuess || !address || !currentGameState) {
        console.log("Missing required data for processTransactionSuccess");
        return false;
      }

      if (processingRef.current) {
        console.log("Already processing transaction, skipping duplicate call");
        return false;
      }

      processingRef.current = true;

      try {
        console.log("Processing transaction success...");

        // Get the last attempt number from current game state
        const lastAttemptIndex = currentGameState.currentAttempt;

        // Use the polling function to get attempt data
        const result = await pollForAttemptData(lastAttemptIndex);

        if (!result) {
          console.error("Failed to get valid attempt data after polling");
          processingRef.current = false;
          return false;
        }

        // Extract the data we need
        const [, , equationXor, encryptedResultFeedback] = result;

        console.log("Unsealing encrypted feedback data...");

        // Unseal the encrypted data
        const [unsealedXor, unsealedResultFeedback] = await Promise.all([
          unsealValue(equationXor, FheTypes.Uint128),
          unsealValue(encryptedResultFeedback, FheTypes.Uint8),
        ]);

        // Check if unsealing was successful
        if (!unsealedXor?.success || !unsealedResultFeedback?.success) {
          console.error("Failed to unseal encrypted data");
          processingRef.current = false;
          return false;
        }

        console.log("Successfully unsealed feedback data");

        // Process the XOR result to get color feedback
        const xorValue = BigInt(unsealedXor.data || 0);
        const cellStates = buildCellStates(xorValue);

        const guess = {
          equation: pendingGuess.equation,
          result: pendingGuess.result.toString(),
          feedback: cellStates,
          resultFeedback: mapResultFeedback(
            Number(unsealedResultFeedback.data || 0)
          ),
        };

        // Add the guess to the local game state
        const updatedGameState = {
          ...currentGameState,
          guesses: [...currentGameState.guesses, guess],
          currentAttempt: currentGameState.currentAttempt + 1,
          hasWon: currentGameState.hasWon, // Only set hasWon from contract, not local calculation
          isGameComplete:
            (cellStates.every((f) => f === "correct") &&
              guess.resultFeedback === "equal") ||
            currentGameState.currentAttempt + 1 >= 6,
        };

        // Update the game state with color feedback
        setGameState(updatedGameState);
        setGameStateSynced(true);

        console.log(
          "Successfully processed transaction and updated game state"
        );
        processingRef.current = false;
        return true;
      } catch (error) {
        console.error("Error in processTransactionSuccess:", error);
        processingRef.current = false;
        return false;
      }
    },
    [address, pollForAttemptData, setGameState, setGameStateSynced, unsealValue]
  );
  const api = useMemo(
    () => ({
      fetchPlayerGameState,
      syncGameStateFromContract,
      rebuildGameStateFromContract,
      processTransactionSuccess,
    }),
    [
      fetchPlayerGameState,
      syncGameStateFromContract,
      rebuildGameStateFromContract,
      processTransactionSuccess,
    ]
  );

  return api;
}
