export function getWorkspaceBadgeLabel(value: string, fallback = "7") {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return fallback;
  }

  return Array.from(normalizedValue)[0]?.toUpperCase() ?? fallback;
}
