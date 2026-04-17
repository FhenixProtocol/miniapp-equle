"use client";

import { useEffect, useMemo, useState } from "react";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { Chain } from "viem";
import { hardhat } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { wagmiConfig } from "../wagmi.config";
import { cofheClient } from "../services/cofhe-client";
import { useCofheStore } from "../store/cofheStore";

export const targetNetworksNoHardhat = wagmiConfig.chains.filter(
  (network: Chain) => network.id !== hardhat.id
);

export const useIsConnectedChainSupported = () => {
  const { chainId } = useAccount();
  return useMemo(
    () =>
      targetNetworksNoHardhat.some((network: Chain) => network.id === chainId),
    [chainId]
  );
};

export function useCofhe() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const isChainSupported = useIsConnectedChainSupported();
  const {
    isInitialized: globalIsInitialized,
    setIsInitialized: setGlobalIsInitialized,
  } = useCofheStore();

  const chainId = publicClient?.chain.id;
  const accountAddress = walletClient?.account.address;

  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isBrowser = typeof window !== "undefined";

  // Reset initialization when chain/account changes
  useEffect(() => {
    setGlobalIsInitialized(false);
  }, [chainId, accountAddress, setGlobalIsInitialized]);

  // Connect SDK client when wallet is ready
  useEffect(() => {
    if (!isBrowser) return;

    const initialize = async () => {
      if (
        globalIsInitialized ||
        isInitializing ||
        !publicClient ||
        !walletClient ||
        !isChainSupported
      ) {
        return;
      }

      try {
        setIsInitializing(true);
        await cofheClient.connect(publicClient, walletClient);
        console.log("CoFHE SDK connected");
        setGlobalIsInitialized(true);
        setError(null);
      } catch (err) {
        console.error("Failed to connect CoFHE SDK:", err);
        setError(
          err instanceof Error ? err : new Error("Unknown error connecting CoFHE SDK")
        );
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [
    isBrowser,
    walletClient,
    publicClient,
    chainId,
    accountAddress,
    isChainSupported,
    globalIsInitialized,
    isInitializing,
    setGlobalIsInitialized,
  ]);

  return {
    isInitialized: globalIsInitialized,
    isInitializing,
    error,
    cofheClient,
    FheTypes,
    Encryptable,
  };
}

export { FheTypes, Encryptable } from "@cofhe/sdk";
