import { useState, useEffect, useRef } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../../contract/contract";
import { useGameStore } from "../store/gameStore";
import { cofheClient } from "../services/cofhe-client";

type EndGameState =
  | "idle" // No endgame action needed
  | "can-finalize" // Player won locally, can finalize game on-chain
  | "finalizing" // Executing finalize transaction
  | "decrypting" // Calling decryptForTx off-chain via Threshold Network
  | "can-claim" // Decryption succeeded, ready to submit ClaimVictory tx
  | "claiming" // Executing ClaimVictory transaction
  | "claimed"; // Victory claimed, can share

export function useDecryptEquation(address?: `0x${string}`) {
  const [endGameState, setEndGameState] = useState<EndGameState>("idle");
  const [finalizeMessage, setFinalizeMessage] = useState<string>("");
  const pendingDecryptRef = useRef<{
    ctHash: `0x${string}`;
    decryptedValue: bigint;
    signature: `0x${string}`;
  } | null>(null);

  const publicClient = usePublicClient();
  const { writeContract, data: hash } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { gameState, setGameState, setGameStateSynced } = useGameStore();

  const { refetch: refetchPlayerGameState } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: "getPlayerGameState",
    args: gameState && address ? [BigInt(gameState.gameId), address] : undefined,
    query: { enabled: !!(gameState && address) },
  });

  const isLastGuessAllCorrect = (): boolean => {
    if (!gameState?.guesses || gameState.guesses.length === 0) return false;
    const lastGuess = gameState.guesses[gameState.guesses.length - 1];
    return lastGuess.feedback.every((f) => f === "correct");
  };

  const isWonButNotFinalized = (): boolean => {
    return isLastGuessAllCorrect() && !gameState?.hasWon;
  };

  // Step 1: finalize tx → on-chain FHE.allowPublic
  const finalizeGame = async () => {
    if (!address) {
      setFinalizeMessage("Wallet not connected");
      return;
    }

    setEndGameState("finalizing");
    setFinalizeMessage("Finalizing game...");

    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: "finalizeGame",
        args: [],
      });
    } catch (error) {
      setFinalizeMessage("Error finalizing game. Please try again.");
      setTimeout(() => setFinalizeMessage(""), 5000);
      setEndGameState("can-finalize");
    }
  };

  // Step 2 (off-chain): after finalize confirms, read the ctHash then decryptForTx
  const runDecryptForTx = async () => {
    if (!address || !gameState || !publicClient) return;

    setEndGameState("decrypting");
    setFinalizeMessage("Decrypting equation...");

    try {
      const ctHash = (await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: "getPlayerEquationXor",
        args: [BigInt(gameState.gameId), address],
      })) as `0x${string}`;

      if (!ctHash || /^0x0+$/.test(ctHash)) {
        throw new Error("No equation ctHash available from contract");
      }

      const { decryptedValue, signature } = await cofheClient
        .decryptForTx(ctHash)
        .withoutPermit()
        .execute();

      pendingDecryptRef.current = {
        ctHash,
        decryptedValue: BigInt(decryptedValue),
        signature: signature as `0x${string}`,
      };

      setEndGameState("can-claim");
      setFinalizeMessage("Equation ready! Claim your victory.");
    } catch (err) {
      console.error("Off-chain decrypt failed:", err);
      setFinalizeMessage(
        err instanceof Error
          ? `Decrypt failed: ${err.message}`
          : "Decrypt failed."
      );
      setEndGameState("can-finalize");
      setTimeout(() => setFinalizeMessage(""), 5000);
    }
  };

  // Step 3: submit ClaimVictory with (decryptedValue, signature)
  const decryptFinalizedEquation = async () => {
    const pending = pendingDecryptRef.current;
    if (!pending) {
      setFinalizeMessage("No decryption result available. Finalize first.");
      setTimeout(() => setFinalizeMessage(""), 5000);
      return;
    }

    setEndGameState("claiming");
    setFinalizeMessage("Claiming victory...");

    try {
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: "ClaimVictory",
        args: [pending.decryptedValue, pending.signature],
      });
    } catch (error) {
      setFinalizeMessage("Error claiming victory NFT. Please try again.");
      setTimeout(() => setFinalizeMessage(""), 5000);
      setEndGameState("can-claim");
    }
  };

  // Watch tx confirmations → drive state machine
  useEffect(() => {
    if (!isConfirmed) return;

    if (endGameState === "finalizing") {
      // finalize tx confirmed → run off-chain decrypt, then transition to can-claim
      runDecryptForTx();
    } else if (endGameState === "claiming") {
      setFinalizeMessage("Updating win status...");
      setTimeout(() => {
        checkPlayerWinStatus();
      }, 2000);
    }
  }, [isConfirmed, endGameState]);

  const checkPlayerWinStatus = async (): Promise<void> => {
    if (!address || !gameState) return;

    try {
      const result = await refetchPlayerGameState();
      if (result.data) {
        const [, hasWon] = result.data as unknown as [number, boolean];

        if (hasWon) {
          if (!gameState.hasWon) {
            setGameState({
              ...gameState,
              hasWon: true,
              isGameComplete: true,
            });
            setGameStateSynced(true);
          }
          setFinalizeMessage("Victory claimed successfully!");
          setTimeout(() => {
            setFinalizeMessage("");
            setEndGameState("claimed");
          }, 3000);
        } else {
          setFinalizeMessage(
            "Claim did not confirm victory. Try again or play another round."
          );
          setTimeout(() => {
            setFinalizeMessage("");
            setEndGameState("idle");
          }, 5000);
        }
      }
    } catch (error) {
      setFinalizeMessage("Error updating win status");
      setTimeout(() => {
        setFinalizeMessage("");
        setEndGameState("can-claim");
      }, 3000);
    }
  };

  // Initial state from game state
  useEffect(() => {
    if (endGameState !== "idle") return;

    if (isWonButNotFinalized()) {
      setEndGameState("can-finalize");
    } else if (gameState?.hasWon && gameState?.isGameComplete) {
      setEndGameState("claimed");
    }
  }, [gameState, endGameState]);

  return {
    // Actions
    finalizeGame,
    decryptFinalizedEquation,
    isWonButNotFinalized,

    // State
    finalizeMessage,
    isFinalizingGame:
      endGameState === "finalizing" ||
      endGameState === "decrypting" ||
      endGameState === "claiming",

    // UI gating
    shouldShowFinalizeButton: endGameState === "can-finalize",
    shouldShowClaimButton: endGameState === "can-claim",
    shouldShowShareButton: endGameState === "claimed",
  };
}
