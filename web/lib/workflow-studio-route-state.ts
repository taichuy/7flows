import { WORKFLOW_API_SAMPLE_QUERY_KEYS } from "@/lib/workflow-api-surface";

type SearchParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readSearchEntries(
  searchParams: SearchParamSource
): Array<[string, string]> {
  if (searchParams instanceof URLSearchParams) {
    return Array.from(searchParams.entries());
  }

  return Object.entries(searchParams).flatMap(([key, rawValue]) => {
    if (typeof rawValue === "undefined") {
      return [];
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values.map((value) => [key, value] as [string, string]);
  });
}

export function buildWorkflowStudioSearchParams(
  searchParams: SearchParamSource,
  options: { omitKeys?: string[] } = {}
) {
  const result = new URLSearchParams();
  const omittedKeys = new Set([...(options.omitKeys ?? []), ...WORKFLOW_API_SAMPLE_QUERY_KEYS]);

  for (const [key, value] of readSearchEntries(searchParams).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (omittedKeys.has(key)) {
      continue;
    }

    result.append(key, value);
  }

  return result;
}

export function appendSearchParamsToHref(href: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${href}?${query}` : href;
}
