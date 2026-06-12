import { createContext, useContext, type ReactNode } from "react";
import {
  useCompareDataset,
  type CompareDatasetContextValue,
} from "@/hooks/useCompareDataset";

const CompareContext = createContext<CompareDatasetContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const value = useCompareDataset();
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompareContext(): CompareDatasetContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error("useCompareContext must be used within CompareProvider");
  }
  return ctx;
}
