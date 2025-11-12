"use client";

import { useState, useEffect } from "react";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { useComposeCast } from "@coinbase/onchainkit/minikit";
import { useGameStore } from "../store/gameStore";
import { useDecryptEquation } from "../hooks/useDecryptEquation";
import { useGameSync } from "../hooks/useGameSync";
import { useGuessSubmission } from "../hooks/useGuessSubmission";
import { RulesModal } from "./RulesModal";
import {
  VirtualKeyboard,
  KeyFeedback,
  ProcessingStep,
} from "./VirtualKeyboard";

type TileState = "empty" | "correct" | "present" | "absent";

interface Tile {
  value: string;
  state: TileState;
}

const EQUATION_LENGTH = 5;
const MAX_ATTEMPTS = 6;

export function NumberleGame({
  gameId: propGameId,
}: {
  gameId: number | null;
}) {
  // Contract and wallet integration
  const { address, isConnected } = useAccount();
  const {
    submitGuess: submitGuessToContract,
    isSubmitting,
    submissionError,
    hash,
    writeError,
    clearError,
    resetWriteError,
  } = useGuessSubmission();
  const { isSuccess: isConfirmed, isError: isTransactionFailed } =
    useWaitForTransactionReceipt({
      hash,
    });

  // Game state management
  const { gameState, clearGameState } = useGameStore();

  // Compose cast for sharing
  const { composeCast } = useComposeCast();

  // Validate game state
  if (gameState && (!gameState.guesses || !Array.isArray(gameState.guesses))) {
    console.error("Invalid game state detected:", gameState);
    // Return a loading state or error state
    return (
      <div className="text-center text-white p-8">
        <p>Game state corrupted. Please refresh the page.</p>
      </div>
    );
  }

  // Game synchronization hook - only need processTransactionSuccess for handling completed transactions
  const { processTransactionSuccess } = useGameSync(address, propGameId);

  // Decryption hook for finalize game functionality
  const {
    isFinalizingGame,
    finalizeMessage,
    finalizeGame,
    decryptFinalizedEquation,
    hasDecryptedEquation,
    shouldShowFinalizeButton,
    shouldShowClaimButton,
    shouldShowShareButton,
  } = useDecryptEquation(address);

  const [pendingGuess, setPendingGuess] = useState<{
    equation: string;
    result: number;
    rowIndex: number;
  } | null>(null);

  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);

  // Component state
  const [currentInput, setCurrentInput] = useState("");
  const [currentCol, setCurrentCol] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [hoveredResultTile, setHoveredResultTile] = useState<number | null>(
    null
  );
  const [warningMessage, setWarningMessage] = useState<string>("");

  // Compute processing state - true when submitting OR waiting for transaction confirmation
  const isProcessingGuess = isSubmitting || !!pendingGuess;

  const hasAtLeastOneOperation = (expression: string): boolean => {
    return /[+\-*/]/.test(expression);
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && pendingGuess && gameState) {
      setProcessingStep("confirming");
      handleTransactionSuccess();
    }
  }, [isConfirmed, pendingGuess, gameState]);

  // Handle transaction failure - clear pending guess to allow retry
  useEffect(() => {
    if (isTransactionFailed && pendingGuess) {
      setPendingGuess(null);
      setProcessingStep(null);
      setWarningMessage("Transaction failed. Please try again.");
      setTimeout(() => setWarningMessage(""), 3000);
    }
  }, [isTransactionFailed, pendingGuess]);

  // Handle writeContract errors (user cancellation, etc.)
  useEffect(() => {
    if (writeError && pendingGuess) {
      setPendingGuess(null);
      setProcessingStep(null);
      // Error message is already set by the hook
    }
  }, [writeError, pendingGuess]);

  // Handle submission errors - fallback for other error cases
  useEffect(() => {
    if (!isSubmitting && pendingGuess && !hash && submissionError) {
      setPendingGuess(null);
      setProcessingStep(null);
      // Don't override existing error message from submissionError
    }
  }, [isSubmitting, pendingGuess, hash, submissionError]);

  const handleTransactionSuccess = async () => {
    if (!pendingGuess || isProcessingTransaction) {
      console.log(
        "Skipping transaction processing - already in progress or no pending guess"
      );
      return;
    }

    try {
      // Set guard to prevent multiple simultaneous calls
      setIsProcessingTransaction(true);

      // Update to decrypting step
      setProcessingStep("decrypting");

      console.log("Transaction confirmed, starting decryption process...");

      const success = await processTransactionSuccess(pendingGuess, gameState!);

      if (success) {
        console.log("Transaction success processed, resetting state...");
        // Reset input state for next guess
        setCurrentInput("");
        setCurrentCol(0);
        setPendingGuess(null);
        setProcessingStep(null);
        setIsProcessingTransaction(false);
      } else {
        console.error(
          "Failed to process transaction success after all retries"
        );
        setProcessingStep(null);
        setPendingGuess(null);
        setIsProcessingTransaction(false);

        // Clear game state to trigger resync
        clearGameState();
        setWarningMessage(
          "Failed to decrypt feedback. Rebuilding game state..."
        );
        setTimeout(() => setWarningMessage(""), 3000);
      }
    } catch (error) {
      console.error("Error in handleTransactionSuccess:", error);
      setProcessingStep(null);
      setPendingGuess(null);
      setIsProcessingTransaction(false);

      // Clear game state to trigger resync
      clearGameState();
      setWarningMessage(
        "Failed to process transaction. Rebuilding game state..."
      );
      setTimeout(() => setWarningMessage(""), 3000);
    }
  };

  const handleShareResult = () => {
    const gameId = gameState?.gameId || propGameId || 0;
    const shareText = `I just won Equle Game ${gameId} by @fhenix ! Can you beat my score?`;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText
    )}&url=${encodeURIComponent("https://equle.arb.fhenix.io/")}`;

    window.open(twitterUrl, "_blank");
  };

  const handleKeyPress = (key: string) => {
    if (
      gameState?.isGameComplete ||
      shouldShowFinalizeButton ||
      isProcessingGuess
    )
      return;

    if (key === "Enter") {
      submitGuess();
    } else if (key === "Backspace") {
      if (currentCol > 0) {
        setCurrentInput((prev) => prev.slice(0, -1));
        setCurrentCol(currentCol - 1);
      }
    } else if (isValidInput(key) && currentCol < EQUATION_LENGTH) {
      setCurrentInput((prev) => prev + key);
      setCurrentCol(currentCol + 1);
    }
  };

  const isValidInput = (key: string): boolean => {
    return /^[0-9+\-*/]$/.test(key);
  };

  // Use calculateResult from the hook for consistency
  const { calculateResult } = useGuessSubmission();

  // Create display board from gameState + current input
  const getDisplayBoard = (): Tile[][] => {
    const displayBoard: Tile[][] = [];

    // Fill completed rows from gameState
    if (gameState?.guesses && Array.isArray(gameState.guesses)) {
      for (let i = 0; i < gameState.guesses.length; i++) {
        const guess = gameState.guesses[i];

        // Validate guess data
        if (!guess || !guess.equation || !Array.isArray(guess.feedback)) {
          console.warn(`Invalid guess data at index ${i}:`, guess);
          continue;
        }

        const row: Tile[] = [];

        for (let j = 0; j < EQUATION_LENGTH; j++) {
          row.push({
            value: guess.equation[j] || "",
            state: guess.feedback[j] || "empty",
          });
        }
        displayBoard.push(row);
      }
    }

    // Add current input row
    if (displayBoard.length < MAX_ATTEMPTS && !gameState?.isGameComplete) {
      const currentRowData: Tile[] = [];
      const currentGuess = currentInput;

      for (let j = 0; j < EQUATION_LENGTH; j++) {
        currentRowData.push({
          value: currentGuess[j] || "",
          state: "empty",
        });
      }
      displayBoard.push(currentRowData);
    }

    // Fill remaining empty rows
    while (displayBoard.length < MAX_ATTEMPTS) {
      const emptyRow: Tile[] = Array(EQUATION_LENGTH).fill({
        value: "",
        state: "empty",
      });
      displayBoard.push(emptyRow);
    }

    return displayBoard;
  };

  const submitGuess = async () => {
    if (currentCol !== EQUATION_LENGTH) return;
    if (!address || !isConnected) return;
    if (gameState?.isGameComplete || shouldShowFinalizeButton) return;
    if (isProcessingGuess) return;

    const currentGuess = currentInput;

    // Basic validation - detailed validation is in the hook
    if (!hasAtLeastOneOperation(currentGuess)) {
      setWarningMessage("Please include at least one operation (+, -, *, /)");
      setTimeout(() => setWarningMessage(""), 3000);
      return;
    }
    setProcessingStep("encrypting");

    // Clear any previous errors
    clearError();
    resetWriteError();
    setWarningMessage("");

    const playerResult = calculateResult(currentGuess);

    // Store pending guess for transaction success handling
    const pendingGuessData = {
      equation: currentGuess,
      result: playerResult,
      rowIndex: gameState?.currentAttempt || 0,
    };
    setPendingGuess(pendingGuessData);

    // Submit using the hook with success and error callbacks
    const success = await submitGuessToContract(
      currentGuess,
      address,
      (data) => {
        console.log("Guess submitted successfully:", data);
        setProcessingStep("submitting");
        // The hook will trigger writeContract, and transaction success will be handled in useEffect
      },
      (error) => {
        console.error("Failed to submit guess:", error);
        setWarningMessage(error);
        setTimeout(() => setWarningMessage(""), 3000);
        setPendingGuess(null);
        setProcessingStep(null);
      }
    );

    if (!success && submissionError) {
      setWarningMessage(submissionError);
      setTimeout(() => setWarningMessage(""), 3000);
      setPendingGuess(null);
      setProcessingStep(null);
    }
  };

  const getKeyboardFeedback = (): Record<string, KeyFeedback> => {
    const feedback: Record<string, KeyFeedback> = {};

    // If no game state or guesses, return empty feedback
    if (!gameState?.guesses) {
      return feedback;
    }

    // Analyze all guesses to determine the best feedback for each character
    gameState.guesses.forEach((guess) => {
      const equation = guess.equation;
      const guessFeedback = guess.feedback;

      for (let i = 0; i < equation.length && i < guessFeedback.length; i++) {
        const char = equation[i];
        const charFeedback = guessFeedback[i] as KeyFeedback;

        // Skip if current feedback is empty or character is empty
        if (!char || charFeedback === "empty") continue;

        // Determine the best feedback (priority: correct > present > absent > empty)
        const currentFeedback = feedback[char] || "empty";
        if (
          charFeedback === "correct" ||
          (charFeedback === "present" && currentFeedback !== "correct") ||
          (charFeedback === "absent" && currentFeedback === "empty")
        ) {
          feedback[char] = charFeedback;
        }
      }
    });

    return feedback;
  };

  const getResultDisplay = (
    rowIndex: number
  ): { value: string; arrow: string } => {
    // For completed rows, get from gameState
    if (gameState?.guesses && rowIndex < gameState.guesses.length) {
      const guess = gameState.guesses[rowIndex];
      const value = guess.result;

      // Get feedback text based on result feedback
      let arrow = "";
      if (guess.resultFeedback === "less") arrow = "LOW";
      else if (guess.resultFeedback === "greater") arrow = "HIGH";
      else if (guess.resultFeedback === "equal") arrow = "✓";

      return { value, arrow };
    }

    // For current row (if user is typing), calculate result on-the-fly
    if (
      rowIndex === (gameState?.currentAttempt || 0) &&
      currentInput.length === EQUATION_LENGTH
    ) {
      try {
        const result = calculateResult(currentInput);
        return { value: result.toString(), arrow: "" };
      } catch (error) {
        return { value: "", arrow: "" };
      }
    }

    return { value: "", arrow: "" };
  };

  const getResultTooltip = (rowIndex: number): string => {
    // For completed rows, get from gameState with feedback info
    if (gameState?.guesses && rowIndex < gameState.guesses.length) {
      const guess = gameState.guesses[rowIndex];
      let feedbackText = "";
      if (guess.resultFeedback === "equal") feedbackText = " (Correct!)";
      else if (guess.resultFeedback === "less")
        feedbackText = " (Too low - aim higher!)";
      else if (guess.resultFeedback === "greater")
        feedbackText = " (Too high - aim lower!)";

      return `Result: ${guess.result}${feedbackText}`;
    }

    // For current row
    if (rowIndex === (gameState?.currentAttempt || 0)) {
      if (currentInput.length === EQUATION_LENGTH) {
        try {
          const result = calculateResult(currentInput);
          return `Result: ${result}`;
        } catch (error) {
          return "Invalid equation";
        }
      }
      return "Complete equation to see result";
    }

    return "Result will appear here";
  };

  // Keyboard handler effect
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyPress(event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentCol, gameState?.isGameComplete]);

  return (
    <>
      <div
        className="mx-auto shadow-lg relative"
        style={{ backgroundColor: "#0AD9DC", width: "fit-content" }}
      >
        {/* Header strip */}
        <div className="flex items-center justify-between px-3 py-1">
          <div className="font-mono uppercase tracking-widest text-black text-base md:text-lg">
            Equle*
          </div>
          <button
            onClick={() => setShowRules(true)}
            className="text-black text-sm underline hover:opacity-80"
          >
            How to play?
          </button>
        </div>
        {/* Board container */}
        <div
          className="relative p-3"
          style={{ backgroundColor: "#021623", border: "2px solid #0AD9DC33" }}
        >
          <div className="relative" style={{ backgroundColor: "#001623" }}>
            <div className="text-center mb-4 relative z-10"></div>
            <button onClick={() => setShowRules(true)} className="hidden">
              How to play
            </button>

            {/* Warning Message */}
            {warningMessage && (
              <div className="mb-4 text-center">
                <div
                  className="inline-block px-4 py-3"
                  style={{
                    color: "#ffffff",
                    backgroundColor: "transparent",
                    borderTop: "2px dotted #0AD9DC",
                    borderBottom: "2px dotted #0AD9DC",
                  }}
                >
                  <span className="block sm:inline font-visitor1 uppercase tracking-widest">
                    {warningMessage}
                  </span>
                </div>
              </div>
            )}

            {/* Processing Step Message */}
            {isProcessingGuess && processingStep && (
              <div className="mb-4 text-center">
                <div
                  className="inline-block px-4 py-3"
                  style={{
                    color: "#ffffff",
                    backgroundColor: "transparent",
                    borderTop: "2px dotted #0AD9DC",
                    borderBottom: "2px dotted #0AD9DC",
                  }}
                >
                  <span className="block sm:inline font-visitor1 uppercase tracking-widest">
                    {processingStep === "encrypting"
                      ? "Encrypting guess..."
                      : processingStep === "submitting"
                      ? "Submitting guess..."
                      : processingStep === "confirming"
                      ? "Confirming..."
                      : processingStep === "decrypting"
                      ? "Decrypting feedback..."
                      : "Processing..."}
                  </span>
                </div>
              </div>
            )}

            {/* Winning Message and Finalize/Claim Button */}
            {(shouldShowFinalizeButton || shouldShowClaimButton) && (
              <div className="mb-4 text-center">
                {/* Branded win banner */}
                <div className="mb-3">
                  <div
                    className="inline-block px-4 py-3"
                    style={{
                      color: "#ffffff",
                      backgroundColor: "transparent",
                      borderTop: "2px dotted #0AD9DC",
                      borderBottom: "2px dotted #0AD9DC",
                    }}
                  >
                    <span className="block sm:inline font-visitor1 uppercase tracking-widest">
                      You solved it!
                    </span>
                  </div>
                  <div className="mt-2 text-xs sm:text-sm text-gray-300 font-mono uppercase tracking-widest">
                    {hasDecryptedEquation()}
                  </div>
                </div>

                {!isFinalizingGame ? (
                  <button
                    onClick={
                      shouldShowClaimButton
                        ? decryptFinalizedEquation
                        : finalizeGame
                    }
                    className="px-4 py-2 bg-white text-black uppercase tracking-widest flex items-center justify-center gap-2 font-bold mx-auto"
                  >
                    <span>
                      {shouldShowClaimButton
                        ? "Claim Victory"
                        : "Finalize Game"}
                    </span>
                    <img
                      src="/button_icon.svg"
                      alt="icon"
                      className="w-3 h-3"
                      style={{ filter: "brightness(0) saturate(100%)" }}
                    />
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-cyan-400"></div>
                    <div className="text-sm font-medium text-white">
                      {finalizeMessage || "Processing..."}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Share Button - shown when victory has been claimed */}
            {shouldShowShareButton && (
              <div className="mb-4 text-center">
                <button
                  onClick={handleShareResult}
                  className="px-4 py-2 bg-transparent text-white uppercase tracking-widest flex items-center justify-center gap-2 font-bold mx-auto border-2 border-dotted border-cyan-400 hover:opacity-80 transition-opacity duration-200"
                >
                  <span>Share Victory</span>
                  <img src="/button_icon.svg" alt="icon" className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Finalize Message */}
            {finalizeMessage && !shouldShowFinalizeButton && (
              <div className="mb-4 text-center">
                <div
                  className="inline-block px-4 py-3"
                  style={{
                    color: "#ffffff",
                    backgroundColor: "transparent",
                    borderTop: "2px dotted #0AD9DC",
                    borderBottom: "2px dotted #0AD9DC",
                  }}
                >
                  <span className="block sm:inline font-visitor1 uppercase tracking-widest">
                    {finalizeMessage}
                  </span>
                </div>
              </div>
            )}

            {/* Game Board */}
            <div className="flex justify-center mb-4 relative z-10">
              <div className="grid gap-0" style={{ width: "fit-content" }}>
                {getDisplayBoard().map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex items-center mb-2 last:mb-0"
                  >
                    <div className="grid grid-cols-5 gap-0 flex-shrink-0">
                      {row.map((tile, colIndex) => (
                        <div
                          key={colIndex}
                          className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center text-xl sm:text-2xl md:text-3xl font-bold transition-colors duration-300"
                          style={{
                            backgroundColor:
                              tile.state === "empty"
                                ? rowIndex ===
                                    (gameState?.currentAttempt || 0) &&
                                  !gameState?.isGameComplete
                                  ? "#1D4748"
                                  : "#162A35"
                                : tile.state === "correct"
                                ? "#1CE07E"
                                : tile.state === "present"
                                ? "#eab308"
                                : "#1D4748",
                            color:
                              tile.state === "empty" ? "#ffffff" : "#0B1F2A",
                            border: "1px solid #FFFFFF",
                          }}
                        >
                          {tile.value ||
                            (tile.state === "empty" &&
                            rowIndex >= (gameState?.currentAttempt || 0)
                              ? ""
                              : "")}
                        </div>
                      ))}
                    </div>

                    {/* Equals sign - always visible */}
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold text-white mx-1 sm:mx-2">
                      =
                    </span>

                    {/* Result tile - always visible */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex items-center justify-center transition-colors duration-300 relative"
                        style={{
                          backgroundColor:
                            gameState?.guesses &&
                            rowIndex < (gameState?.guesses?.length || 0)
                              ? gameState.guesses[rowIndex].resultFeedback ===
                                "equal"
                                ? "#1CE07E"
                                : gameState.guesses[rowIndex].resultFeedback ===
                                  "less"
                                ? "#1DCAD6"
                                : "#F29C7B"
                              : "#162A35",
                          color: "#0B1F2A",
                          border: "1px solid #FFFFFF",
                        }}
                        onMouseEnter={() => setHoveredResultTile(rowIndex)}
                        onMouseLeave={() => setHoveredResultTile(null)}
                      >
                        {/* Centered value when no feedback; positioned value+arrow when feedback exists */}
                        {gameState?.guesses &&
                        rowIndex < (gameState?.guesses?.length || 0) ? (
                          <>
                            <span
                              className="absolute left-1 bottom-1 sm:left-1 sm:bottom-1 md:left-2 md:bottom-2 text-lg sm:text-xl md:text-2xl font-bold leading-none"
                              style={{ color: "#0B1F2A" }}
                            >
                              {getResultDisplay(rowIndex).value}
                            </span>
                            {getResultDisplay(rowIndex).arrow && (
                              <span
                                className="absolute right-1 top-1 sm:right-1 sm:top-1 md:right-2 md:top-2 text-base sm:text-lg md:text-xl font-bold leading-none"
                                style={{ color: "#0B1F2A" }}
                              >
                                {getResultDisplay(rowIndex).arrow === "LOW"
                                  ? "↑"
                                  : getResultDisplay(rowIndex).arrow === "HIGH"
                                  ? "↓"
                                  : "✓"}
                              </span>
                            )}
                          </>
                        ) : (
                          <span
                            className="text-lg sm:text-xl md:text-2xl font-bold leading-none"
                            style={{ color: "#ffffff" }}
                          >
                            {getResultDisplay(rowIndex).value}
                          </span>
                        )}
                      </div>

                      {/* Custom tooltip */}
                      {hoveredResultTile === rowIndex && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-10">
                          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                            {getResultTooltip(rowIndex)}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Loss Message - shown only when max attempts reached without winning */}
        {gameState?.isGameComplete &&
          !gameState?.hasWon &&
          gameState?.currentAttempt >= (gameState?.maxAttempts || 6) &&
          !shouldShowFinalizeButton &&
          !shouldShowClaimButton && (
            <div className="mt-6 text-center relative z-10">
              <div className="mb-4">
                <div
                  className="inline-block px-4 py-3 text-center"
                  style={{
                    color: "#000000",
                    backgroundColor: "transparent",
                    borderTop: "2px dotted #0AD9DC",
                    borderBottom: "2px dotted #0AD9DC",
                  }}
                >
                  <span className="block sm:inline font-mono uppercase tracking-widest">
                    Game Over
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* Win Message - shown only when victory is fully claimed */}
        {gameState?.hasWon &&
          gameState?.isGameComplete &&
          !shouldShowFinalizeButton &&
          !shouldShowClaimButton &&
          !shouldShowShareButton && (
            <div className="mt-6 text-center relative z-10">
              <div className="mb-4">
                <div
                  className="inline-block px-4 py-3 text-center"
                  style={{
                    color: "#000000",
                    backgroundColor: "transparent",
                    borderTop: "2px dotted #0AD9DC",
                    borderBottom: "2px dotted #0AD9DC",
                  }}
                >
                  <span className="block sm:inline font-mono uppercase tracking-widest text-center">
                    Congratulations!
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* Rules Modal */}
        <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
      </div>

      {/* Virtual Keyboard */}
      <div className="mx-auto w-fit">
        <VirtualKeyboard
          onKeyPress={handleKeyPress}
          isDisabled={isProcessingGuess}
          keyFeedback={getKeyboardFeedback()}
          isProcessingGuess={isProcessingGuess}
          processingStep={processingStep}
          currentCol={currentCol}
          hasAtLeastOneOperation={hasAtLeastOneOperation}
          currentInput={currentInput}
        />
      </div>
    </>
  );
}
