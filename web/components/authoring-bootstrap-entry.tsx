"use client";

import { useEffect, useState, type ReactNode } from "react";

type AuthoringBootstrapEntryProps<BootstrapRequest, BootstrapData> = {
  bootstrapRequest: BootstrapRequest;
  loadBootstrap: (request: BootstrapRequest) => Promise<BootstrapData>;
  preloadModule?: () => Promise<unknown>;
  initialBootstrapData?: BootstrapData | null;
  loadingState: ReactNode;
  children: (bootstrapData: BootstrapData) => ReactNode;
};

export function AuthoringBootstrapEntry<BootstrapRequest, BootstrapData>({
  bootstrapRequest,
  loadBootstrap,
  preloadModule,
  initialBootstrapData,
  loadingState,
  children
}: AuthoringBootstrapEntryProps<BootstrapRequest, BootstrapData>) {
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(
    initialBootstrapData ?? null
  );

  useEffect(() => {
    let active = true;

    setBootstrapData(initialBootstrapData ?? null);
    if (preloadModule) {
      void preloadModule();
    }
    void loadBootstrap(bootstrapRequest).then((nextBootstrapData) => {
      if (!active) {
        return;
      }

      setBootstrapData(nextBootstrapData);
    });

    return () => {
      active = false;
    };
  }, [bootstrapRequest, initialBootstrapData, loadBootstrap, preloadModule]);

  if (!bootstrapData) {
    return <>{loadingState}</>;
  }

  return <>{children(bootstrapData)}</>;
}
