import { useState, useEffect } from "react";
import { useWriteContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../../contract/contract";
import { Encryptable } from "@cofhe/sdk";
import { cofheClient } from "../services/cofhe-client";
import { equationToAllRotations } from "../../../utils";

export function useGuessSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>("");

  const { writeContract, data: hash, error: writeError, reset } = useWriteContract();

  // Handle writeContract errors - show the actual error message from wagmi
  useEffect(() => {
    if (writeError) {
      console.error("WriteContract error:", writeError);
      setIsSubmitting(false);
      setSubmissionError(writeError.message || "Transaction failed");
    }
  }, [writeError]);

  // Calculate the result using left-to-right evaluation (same as contract logic)
  const calculateResult = (expression: string): number => {
    let result = 0;
    let currentNumber = 0;
    let operator = "+";

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      if (!isNaN(Number(char))) {
        currentNumber = currentNumber * 10 + Number(char);
      }

      if (["+", "-", "*", "/"].includes(char) || i === expression.length - 1) {
        switch (operator) {
          case "+":
            result += currentNumber;
            break;
          case "-":
            result -= currentNumber;
            break;
          case "*":
            result *= currentNumber;
            break;
          case "/":
            result = Math.floor(result / currentNumber);
            break;
        }

        operator = char;
        currentNumber = 0;
      }
    }

    return result;
  };

  const isValidExpression = (expression: string): boolean => {
    const EQUATION_LENGTH = 5;

    if (expression.length !== EQUATION_LENGTH) return false;
    if (expression.includes("=")) return false;

    const hasAtLeastOneOperation = /[+\-*/]/.test(expression);
    if (!hasAtLeastOneOperation) return false;

    // Check if first or last character is an operation
    if (
      /[+\-*/]/.test(expression[0]) ||
      /[+\-*/]/.test(expression[expression.length - 1])
    ) {
      return false;
    }

    // Check if the result would be negative
    try {
      const result = calculateResult(expression);
      if (result < 0) {
        return false;
      }
    } catch (error) {
      return false;
    }

    return true;
  };

  const encryptGuess = async (
    equation: string,
    address: `0x${string}`
  ): Promise<{
    encryptedEquation: any;
    encryptedResult: any;
    result: number;
  } | null> => {
    try {
      setSubmissionError("");

      if (!isValidExpression(equation)) {
        setSubmissionError("Invalid equation format");
        return null;
      }

      console.log("Encrypting guess:", equation);

      // Calculate result
      const result = calculateResult(equation);
      console.log("Calculated result:", result);

      // Generate all rotations for the equation
      const allRotations = equationToAllRotations(equation);
      console.log("All rotations (as BigInt):", allRotations.toString());

      // Encrypt the equation rotations
      const [encryptedEquation] = await cofheClient
        .encryptInputs([Encryptable.uint128(allRotations)])
        .execute();

      // Encrypt the result
      const [encryptedResult] = await cofheClient
        .encryptInputs([Encryptable.uint16(BigInt(result))])
        .execute();

      console.log("Encryption successful:", {
        equation,
        result,
        encryptedEquation,
        encryptedResult,
      });

      return {
        encryptedEquation,
        encryptedResult,
        result,
      };
    } catch (error) {
      console.error("Encryption failed:", error);
      setSubmissionError("Encryption failed. Please try again.");
      return null;
    }
  };

  const submitGuess = async (
    equation: string,
    address: `0x${string}`,
    onSuccess?: (data: {
      equation: string;
      result: number;
      rowIndex: number;
    }) => void,
    onError?: (error: string) => void
  ): Promise<boolean> => {
    if (!address) {
      const errorMsg = "Wallet not connected";
      setSubmissionError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    setIsSubmitting(true);
    setSubmissionError("");

    try {
      // Encrypt the guess
      const encryptedData = await encryptGuess(equation, address);
      if (!encryptedData) {
        setIsSubmitting(false);
        onError?.(submissionError || "Encryption failed");
        return false;
      }

      const { encryptedEquation, encryptedResult, result } = encryptedData;

      console.log("Submitting encrypted guess to contract...");

      // Clear any previous write errors
      reset();

      try {
        // Submit to contract - cast to any because the SDK's EncryptedUint*Input
        // `signature` field is typed as string, but wagmi's ABI expects `0x${string}`.
        writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: "guess",
          args: [encryptedEquation as any, encryptedResult as any],
        });

        console.log("Contract transaction initiated");

        // Call success callback with guess data
        onSuccess?.({
          equation,
          result,
          rowIndex: 0, // This will be updated by the caller if needed
        });

        return true;
      } catch (writeErr) {
        console.error("WriteContract failed:", writeErr);
        const errorMsg = "Transaction cancelled or failed";
        setSubmissionError(errorMsg);
        onError?.(errorMsg);
        return false;
      }
    } catch (error) {
      console.error("Failed to submit guess:", error);
      const errorMsg = "Failed to submit guess. Please try again.";
      setSubmissionError(errorMsg);
      onError?.(errorMsg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    // State
    isSubmitting,
    submissionError,
    hash,
    writeError,

    // Functions
    submitGuess,
    encryptGuess,
    calculateResult,
    isValidExpression,

    // Utils
    clearError: () => setSubmissionError(""),
    resetWriteError: reset,
  };
}
