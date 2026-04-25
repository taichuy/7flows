export interface PanelSlice {
  issuesOpen: boolean;
  historyOpen: boolean;
  publishConfigOpen: boolean;
  debugConsoleOpen: boolean;
  debugConsoleWidth: number;
  debugConsoleActiveTab: 'conversation' | 'trace' | 'variables';
  nodeDetailTab: 'config' | 'lastRun';
  nodeDetailWidth: number;
  nodePickerState: {
    open: boolean;
    anchorNodeId: string | null;
    anchorEdgeId: string | null;
    anchorCanvasPosition: { x: number; y: number } | null;
  };
}
