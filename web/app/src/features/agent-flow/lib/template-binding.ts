import type { FlowSelectorOption } from './selector-options';

export const TEMPLATE_SELECTOR_REGEX = /{{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*}}/g;

function isSameSelector(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

export function createTemplateSelectorToken(selector: string[]) {
  if (selector.length < 2) {
    return '';
  }

  return `{{${selector[0]}.${selector[1]}}}`;
}

export function parseTemplateSelectorTokens(value: string): string[][] {
  const selectors: string[][] = [];

  for (const match of value.matchAll(TEMPLATE_SELECTOR_REGEX)) {
    selectors.push([match[1], match[2]]);
  }

  return selectors;
}

export function dedupeSelectors(selectors: string[][]): string[][] {
  const seen = new Set<string>();

  return selectors.filter((selector) => {
    const key = selector.join('\u0000');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getTemplateSelectorLabel(
  selector: string[],
  options: FlowSelectorOption[]
) {
  const matchedOption = options.find((option) => isSameSelector(option.value, selector));

  return matchedOption ? matchedOption.displayLabel : `${selector[0]} / ${selector[1]}`;
}

export function remapTemplateSelectorTokens(
  value: string,
  idMap: Map<string, string>
) {
  return value.replace(
    TEMPLATE_SELECTOR_REGEX,
    (_match, nodeId: string, outputKey: string) =>
      createTemplateSelectorToken([idMap.get(nodeId) ?? nodeId, outputKey])
  );
}

export function getTemplateSelectorTokenMatch(value: string) {
  TEMPLATE_SELECTOR_REGEX.lastIndex = 0;

  return TEMPLATE_SELECTOR_REGEX.exec(value);
}

export function isTemplateSelectorToken(value: string) {
  const match = getTemplateSelectorTokenMatch(value);

  return match !== null && match[0] === value;
}
