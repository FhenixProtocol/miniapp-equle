import { create } from "zustand";

interface CofheState {
  isInitialized: boolean;
  setIsInitialized: (isInitialized: boolean) => void;
  // Incremented whenever a permit is created / removed so consumers can
  // re-read `cofheClient.permits.getActivePermit()` reactively.
  permitVersion: number;
  bumpPermitVersion: () => void;
}

export const useCofheStore = create<CofheState>((set) => ({
  isInitialized: false,
  setIsInitialized: (isInitialized: boolean) => set({ isInitialized }),
  permitVersion: 0,
  bumpPermitVersion: () =>
    set((state) => ({ permitVersion: state.permitVersion + 1 })),
}));
