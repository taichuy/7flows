export function formatNodeVariableLabel(nodeName: string, variableName: string) {
  return `${nodeName}/${variableName}`;
}

export function formatNodeVariablePathLabel(
  nodeName: string,
  variablePath: string
) {
  return formatNodeVariableLabel(nodeName, variablePath);
}
