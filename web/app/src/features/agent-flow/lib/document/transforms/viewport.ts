import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export function setViewport(
  document: FlowAuthoringDocument,
  viewport: FlowAuthoringDocument['editor']['viewport']
): FlowAuthoringDocument {
  const currentViewport = document.editor.viewport;

  if (
    currentViewport.x === viewport.x &&
    currentViewport.y === viewport.y &&
    currentViewport.zoom === viewport.zoom
  ) {
    return document;
  }

  return {
    ...document,
    editor: {
      ...document.editor,
      viewport
    }
  };
}
