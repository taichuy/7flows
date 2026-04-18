import {
  createContext,
  useContext,
  useRef,
  type PropsWithChildren
} from 'react';
import type { ConsoleApplicationOrchestrationState } from '@1flowbase/api-client';
import { useStore } from 'zustand';

import {
  createAgentFlowEditorStore,
  type AgentFlowEditorState
} from './index';

type AgentFlowEditorStore = ReturnType<typeof createAgentFlowEditorStore>;

const AgentFlowEditorStoreContext =
  createContext<AgentFlowEditorStore | null>(null);

export function AgentFlowEditorStoreProvider({
  initialState,
  children
}: PropsWithChildren<{
  initialState: ConsoleApplicationOrchestrationState;
}>) {
  const storeRef = useRef<AgentFlowEditorStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createAgentFlowEditorStore(initialState);
  }

  return (
    <AgentFlowEditorStoreContext.Provider value={storeRef.current}>
      {children}
    </AgentFlowEditorStoreContext.Provider>
  );
}

export function useAgentFlowEditorStore<T>(
  selector: (state: AgentFlowEditorState) => T
) {
  const store = useContext(AgentFlowEditorStoreContext);

  if (!store) {
    throw new Error('AgentFlowEditorStoreProvider is missing');
  }

  return useStore(store, selector);
}
