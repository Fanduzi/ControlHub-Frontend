// input: react, services/settings, lib/preferences
// output: environment list context loaded only with a legacy browser credential
// pos: console environment selector data source
// note: if this file changes, update header and components/providers/README.md
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
    // Legacy browser credential only. A BFF sealed session (#14) is HttpOnly and
    // invisible here; #15 will fetch environments through the BFF proxy instead.
    // Probing /environments without a credential only produces 401 noise.
    const hasLegacyToken =
      Boolean(window.sessionStorage.getItem("controlhub.token")) ||
      document.cookie
        .split(";")
        .some((part) => part.trim().startsWith("controlhub.token="));
    if (!hasLegacyToken) {
      // Defer so we don't sync-set state inside the effect body (lint).
      void Promise.resolve().then(() => setLoading(false));
      return;
    }

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
