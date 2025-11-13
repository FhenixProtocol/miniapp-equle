"use client";

// Force dynamic rendering, skip prerendering
export const dynamic = "force-dynamic";

import { NumberleGame } from "./components/NumberleGame";
import { DisconnectedScreen } from "./components/DisconnectedScreen";
import { MonitorFrame } from "./components/MonitorFrame";
import { Footer } from "./components/Footer";
import { useAccount, useBalance } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { Navbar } from "./components/Navbar";
import { useCofheStore } from "./store/cofheStore";
import { useCurrentGameId } from "./hooks/useCurrentGameId";
import { useGameStateValidator } from "./hooks/useGameStateValidator";
import { GameSyncLoading } from "./components/GameSyncLoading";
import { GameSyncError } from "./components/GameSyncError";
import { VirtualKeyboardSkeleton } from "./components/VirtualKeyboardSkeleton";
import { FHEModal } from "./components/FHEModal";
import { useEffect, useState } from "react";
import { usePermit } from "./hooks/usePermit";
import Link from "next/link";
import { baseSepolia } from "viem/chains";

export default function Home() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({
    address: address,
    chainId: baseSepolia.id,
  });
  const { isInitialized: isCofheInitialized } = useCofheStore();
  const { gameId: currentGameId } = useCurrentGameId();
  const {
    hasValidPermit,
    isGeneratingPermit,
    error: permitError,
    generatePermit,
    removePermit,
  } = usePermit(currentGameId);
  const {
    syncStatus,
    isValidating,
    error: syncError,
    validateAndSync,
  } = useGameStateValidator(address, currentGameId);
  const [showFHE, setShowFHE] = useState(false);

  // Check if ETH balance is exactly 0
  const isOutOfETH = balance?.value === BigInt(0);

  useEffect(() => {
    const initializeMiniApp = async () => {
      if (!isFrameReady) {
        setFrameReady();

        try {
          await sdk.actions.addMiniApp();
        } catch (error) {
          // Silently handle error
        }
      }
    };

    initializeMiniApp();
  }, [isFrameReady, setFrameReady]);

  // Trigger sync when permit becomes available
  useEffect(() => {
    if (
      hasValidPermit &&
      isCofheInitialized &&
      address &&
      currentGameId !== null
    ) {
      console.log("Valid permit available, triggering sync");
      validateAndSync();
    }
  }, [
    hasValidPermit,
    isCofheInitialized,
    address,
    currentGameId,
    // validateAndSync removed to prevent infinite loops due to its changing dependencies
  ]);

  const handleGeneratePermit = async () => {
    const result = await generatePermit();
    if (!result.success) {
      console.error("Failed to generate permit:", result.error);
    }
  };

  const handleRemovePermit = async () => {
    const success = await removePermit();
    if (success) {
      console.log("Permit removed successfully");
    }
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
        <div className="container mx-auto px-4 pt-4 pb-8">
          <div className="max-w-2xl mx-auto space-y-3">
            {isConnected ? <Navbar currentGameId={currentGameId} /> : null}
            {/* Game Day Display
            {isConnected && currentGameId !== null && (
              <div className="text-center mb-4">
                <p className="text-white text-xl font-visitor1 uppercase tracking-widest">
                  Game <span style={{ color: "#0AD9DC" }}>{currentGameId}</span>
                </p>
              </div>
            )} */}
            {/* ETH Balance Warning */}
            {isConnected && isOutOfETH && (
              <div className="text-center ">
                <div
                  className="inline-block px-3 py-1 rounded-lg"
                  style={{
                    backgroundColor: "rgba(220, 53, 69, 0.1)",
                  }}
                >
                  <Link
                    href="https://portal.cdp.coinbase.com/products/faucet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white text-s underline hover:opacity-80 transition-opacity duration-200  inline-block"
                  >
                    Get some testnet ETH here →
                  </Link>
                </div>
              </div>
            )}
            <div>
              {!isConnected ||
              !isCofheInitialized ||
              !hasValidPermit ||
              syncStatus !== "synced" ? (
                <>
                  <MonitorFrame
                    screenInsets={{ top: 6, right: 6, bottom: 8, left: 6 }}
                  >
                    {!isConnected ? (
                      <DisconnectedScreen />
                    ) : !isCofheInitialized || !hasValidPermit ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 py-8 pb-12">
                        <div className="text-center">
                          <div className="font-visitor1 uppercase text-white text-lg sm:text-xl tracking-widest px-3 py-2">
                            {!isCofheInitialized ? "Initializing CoFHE" : ""}
                          </div>

                          <p className="text-gray-300 text-xs sm:text-sm mt-3 font-visitor1 uppercase tracking-widest max-w-md">
                            {!isCofheInitialized
                              ? "Setting up fully homomorphic encryption for secure gameplay"
                              : "A permit is required to authenticate your identity and grant access to your encrypted data."}
                          </p>

                          {permitError && (
                            <p className="text-red-400 text-xs mt-2 font-visitor1 uppercase tracking-widest max-w-md">
                              Error: {permitError}
                            </p>
                          )}
                        </div>

                        {isCofheInitialized && (
                          <button
                            onClick={handleGeneratePermit}
                            disabled={hasValidPermit || isGeneratingPermit}
                            className="mt-2 mb-2 inline-flex items-center gap-2 px-6 py-2 text-white uppercase tracking-widest transition-opacity duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "transparent",
                              borderTop: "2px dotted #0AD9DC",
                              borderBottom: "2px dotted #0AD9DC",
                              borderLeft: "none",
                              borderRight: "none",
                            }}
                          >
                            {isGeneratingPermit ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                <span>Generating...</span>
                              </>
                            ) : hasValidPermit ? (
                              <>
                                <span>✓ Permit Generated</span>
                              </>
                            ) : (
                              <>
                                <span>Generate Permit</span>
                                <img
                                  src="/button_icon.svg"
                                  alt="icon"
                                  className="w-3 h-3"
                                />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : syncStatus === "loading" ||
                      syncStatus === "needs-sync" ? (
                      <GameSyncLoading
                        message={
                          isValidating
                            ? "Rebuilding game progress..."
                            : "Synchronizing with blockchain..."
                        }
                      />
                    ) : (
                      <GameSyncError
                        error={syncError || "Failed to sync game state"}
                        onRetry={validateAndSync}
                      />
                    )}
                  </MonitorFrame>

                  <div className="mt-6 mx-auto w-fit">
                    <VirtualKeyboardSkeleton />
                  </div>
                </>
              ) : (
                <NumberleGame gameId={currentGameId} />
              )}
            </div>
            {/* FHE Information Button */}
            {isConnected && isCofheInitialized && (
              <div className="text-center mt-2">
                <button
                  onClick={() => setShowFHE(true)}
                  className="text-sm underline hover:opacity-80 transition-opacity duration-200"
                  style={{ color: "#0AD9DC" }}
                >
                  🔐 Why is this game secure? Learn about FHE
                </button>
              </div>
            )}
            {/* Remove Permit Button */}
            {isConnected && isCofheInitialized && hasValidPermit && (
              <div className="text-center mt-1">
                <button
                  onClick={handleRemovePermit}
                  className="text-xs underline hover:opacity-80 transition-opacity duration-200"
                  style={{ color: "#DC3545" }}
                >
                  🗑️ Revoke Permit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* <Footer /> */}

      {/* FHE Modal */}
      <FHEModal isOpen={showFHE} onClose={() => setShowFHE(false)} />
    </div>
  );
}
