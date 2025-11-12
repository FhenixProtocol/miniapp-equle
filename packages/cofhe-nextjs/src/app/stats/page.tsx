"use client";

// Force dynamic rendering, skip prerendering
export const dynamic = "force-dynamic";

import { DisconnectedScreen } from "../components/DisconnectedScreen";
import { MonitorFrame } from "../components/MonitorFrame";
import { Footer } from "../components/Footer";
import { useAccount, useReadContract } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Navbar } from "../components/Navbar";
import { VirtualKeyboardSkeleton } from "../components/VirtualKeyboardSkeleton";
import { useEffect, useState } from "react";
import { NFT_ADDRESS, NFT_CONTRACT_ABI } from "../../../contract/contract";
import { GuessDistributionModal } from "../components/GuessDistributionModal";
import Link from "next/link";

export default function StatsPage() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [isGuessModalOpen, setIsGuessModalOpen] = useState(false);

  // No CoFHE or permit logic on stats page

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  // --- NFT Reads ---
  const hasNFTQuery = useReadContract({
    address: NFT_ADDRESS as `0x${string}`,
    abi: NFT_CONTRACT_ABI as any,
    functionName: "hasNFT",
    args: [address as `0x${string}`],
  });

  const playerStatsQuery = useReadContract({
    address: NFT_ADDRESS as `0x${string}`,
    abi: NFT_CONTRACT_ABI as any,
    functionName: "getPlayerStats",
    args: [address as `0x${string}`],
    query: {
      enabled: Boolean(isConnected && hasNFTQuery.data === true),
    },
  });

  const toStringSafe = (value: any): any => {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map((v) => toStringSafe(v));
    return value ?? "-";
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "#001623",
        backgroundImage: "url('/background.png')",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {isConnected ? <Navbar /> : null}

            <div className="mt-8">
              <>
                {/* Page Title with Back Button */}
                <div className="mb-4 relative flex items-center justify-center">
                  {isConnected && (
                    <Link
                      href="/"
                      className="absolute left-0 text-white text-xl hover:opacity-80 transition-opacity duration-200"
                      style={{ color: "#0AD9DC" }}
                    >
                      ←
                    </Link>
                  )}
                  <p className="text-white text-xl font-visitor1 uppercase tracking-widest">
                    Your Status
                  </p>
                </div>
                <MonitorFrame
                  screenInsets={{ top: 6, right: 6, bottom: 8, left: 6 }}
                >
                  {!isConnected ? (
                    <DisconnectedScreen />
                  ) : hasNFTQuery.isLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-cyan-400"></div>
                      <div className="text-sm font-medium text-white">
                        Checking NFT...
                      </div>
                    </div>
                  ) : hasNFTQuery.data === false ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-white font-visitor1 uppercase tracking-widest text-sm text-center px-4">
                        You have not won a game yet. No stats available.
                      </p>
                    </div>
                  ) : playerStatsQuery.isLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-cyan-400"></div>
                      <div className="text-sm font-medium text-white">
                        Loading stats...
                      </div>
                    </div>
                  ) : playerStatsQuery.data ? (
                    <div className="w-full h-full p-3 sm:p-5 text-white">
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="text-center">
                          <div className="text-[10px] sm:text-xs text-gray-300 font-visitor1 uppercase tracking-widest">
                            Total Wins
                          </div>
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
                            {toStringSafe(
                              (playerStatsQuery.data as any).totalWins ??
                                (playerStatsQuery.data as any)[0]
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] sm:text-xs text-gray-300 font-visitor1 uppercase tracking-widest">
                            Current Streak
                          </div>
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
                            {toStringSafe(
                              (playerStatsQuery.data as any).currentStreak ??
                                (playerStatsQuery.data as any)[1]
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] sm:text-xs text-gray-300 font-visitor1 uppercase tracking-widest">
                            Max Streak
                          </div>
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
                            {toStringSafe(
                              (playerStatsQuery.data as any).maxStreak ??
                                (playerStatsQuery.data as any)[2]
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] sm:text-xs text-gray-300 font-visitor1 uppercase tracking-widest">
                            Last Game Day Won
                          </div>
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold">
                            {toStringSafe(
                              (playerStatsQuery.data as any).lastGamePlayed ??
                                (playerStatsQuery.data as any)[3]
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 sm:mt-6">
                        <div className="text-center mb-2 sm:mb-3 text-[10px] sm:text-xs text-gray-300 font-visitor1 uppercase tracking-widest">
                          Guess Distribution
                        </div>
                        <button
                          onClick={() => setIsGuessModalOpen(true)}
                          className="mx-auto block w-full max-w-xs px-5 py-2 bg-white text-black uppercase tracking-widest text-xs sm:text-sm font-bold hover:opacity-90"
                        >
                          <span>View Guess Distribution</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </MonitorFrame>

                <div className="mt-6 mx-auto w-fit">
                  <VirtualKeyboardSkeleton />
                </div>
              </>
            </div>
          </div>
        </div>
      </div>
      <Footer />
      {Boolean(playerStatsQuery?.data)
        ? (() => {
            const raw = toStringSafe(
              (playerStatsQuery!.data as any).guessDistribution ??
                (playerStatsQuery!.data as any)[4]
            ) as any[];
            const distribution = raw.map((v: any) => Number(v));
            const totalWins = Number(
              toStringSafe(
                (playerStatsQuery!.data as any).totalWins ??
                  (playerStatsQuery!.data as any)[0]
              )
            );
            return (
              <GuessDistributionModal
                isOpen={isGuessModalOpen}
                onClose={() => setIsGuessModalOpen(false)}
                distribution={distribution}
                totalWins={totalWins}
              />
            );
          })()
        : null}
    </div>
  );
}
