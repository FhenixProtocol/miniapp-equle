import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../../contract/contract";

export function usePlayerAttempt(
  address?: `0x${string}`,
  gameId?: number | null,
  attemptIndex?: number
) {
  const args =
    address &&
    gameId !== null &&
    gameId !== undefined &&
    attemptIndex !== undefined
      ? [BigInt(gameId), address, attemptIndex]
      : undefined;

  const { data, refetch } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: "getPlayerAttempt",
    args: args as any,
  });

  return { data, refetch };
}
