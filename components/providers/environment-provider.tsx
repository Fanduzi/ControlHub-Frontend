"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { Environment } from "@/types/settings";
import { listEnvironments } from "@/services/settings";
import {
  readStoredEnvironmentId,
  persistEnvironmentId,
} from "@/lib/preferences";

type EnvironmentContextValue = {
  environments: Environment[];
  currentEnvironmentId: number | null;
  setEnvironmentId: (id: number | null) => void;
  loading: boolean;
};

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);
const emptySubscribe = () => () => {};

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [envId, setEnvIdState] = useState<number | null>(null);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const currentEnvironmentId = mounted ? readStoredEnvironmentId() : envId;

  useEffect(() => {
    listEnvironments()
      .then((envs) => {
        setEnvironments(envs);
      })
      .catch(() => {
        // Keep fallback environments on API failure
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  function setEnvironmentId(id: number | null) {
    persistEnvironmentId(id);
    setEnvIdState(id);
  }

  return (
    <EnvironmentContext.Provider
      value={{
        environments,
        currentEnvironmentId,
        setEnvironmentId,
        loading,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);

  if (!context) {
    throw new Error(
      "useEnvironment must be used within an EnvironmentProvider",
    );
  }

  return context;
}
