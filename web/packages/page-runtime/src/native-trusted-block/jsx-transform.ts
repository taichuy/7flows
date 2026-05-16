import type { BlockProtocolError } from '@1flowbase/page-protocol';

export interface NativeTrustedBlockJsxTransformOptions {
  reactIdentifier?: string;
  componentIdentifiers: ReadonlySet<string>;
}

export interface NativeTrustedBlockJsxTransformSuccess {
  ok: true;
  source: string;
  transformed: boolean;
  errors: [];
}

export interface NativeTrustedBlockJsxTransformFailure {
  ok: false;
  errors: BlockProtocolError[];
}

export type NativeTrustedBlockJsxTransformResult =
  | NativeTrustedBlockJsxTransformSuccess
  | NativeTrustedBlockJsxTransformFailure;

interface JsxElementTransform {
  expression: string;
  end: number;
}

interface JsxAttribute {
  name: string;
  value: string;
}

interface JsxOpeningElement {
  tagName: string;
  attributes: JsxAttribute[];
  selfClosing: boolean;
  end: number;
}

interface JsxClosingElement {
  tagName: string;
  end: number;
}

interface JsxExpression {
  expression: string;
  end: number;
}

class NativeTrustedBlockJsxTransformError extends Error {
  readonly protocolError: BlockProtocolError;

  constructor(path: string, message: string) {
    super(message);
    this.protocolError = {
      code: 'runtime_error',
      path,
      message
    };
  }
}

export function transformNativeTrustedBlockJsx(
  source: string,
  options: NativeTrustedBlockJsxTransformOptions
): NativeTrustedBlockJsxTransformResult {
  try {
    const transformed = transformJsxSource(source, options);
    return {
      ok: true,
      source: transformed.source,
      transformed: transformed.transformed,
      errors: []
    };
  } catch (error) {
    if (error instanceof NativeTrustedBlockJsxTransformError) {
      return { ok: false, errors: [error.protocolError] };
    }

    return {
      ok: false,
      errors: [
        createRuntimeError(
          'source.jsx',
          'Native trusted block JSX could not be transformed.'
        )
      ]
    };
  }
}

function transformJsxSource(
  source: string,
  options: NativeTrustedBlockJsxTransformOptions
): { source: string; transformed: boolean } {
  let index = 0;
  let cursor = 0;
  let output = '';
  let transformed = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      index = consumeLineComment(source, index + 2);
      continue;
    }

    if (char === '/' && next === '*') {
      index = consumeBlockComment(source, index);
      continue;
    }

    if (char === '"' || char === "'") {
      index = consumeQuotedString(source, index, char);
      continue;
    }

    if (char === '`') {
      index = consumeTemplate(source, index);
      continue;
    }

    if (isJsxStart(source, index)) {
      output += source.slice(cursor, index);
      const element = parseJsxElement(source, index, options);
      output += element.expression;
      index = element.end;
      cursor = index;
      transformed = true;
      continue;
    }

    index += 1;
  }

  output += source.slice(cursor);

  return {
    source: transformed ? output : source,
    transformed
  };
}

function parseJsxElement(
  source: string,
  start: number,
  options: NativeTrustedBlockJsxTransformOptions
): JsxElementTransform {
  const reactIdentifier = options.reactIdentifier;
  if (!reactIdentifier) {
    throwJsxError(
      'source.jsx.runtime',
      'Native trusted block JSX requires an injected React binding.'
    );
  }

  const opening = parseOpeningElement(source, start, options);
  if (opening.selfClosing) {
    return {
      expression: createElementExpression(
        reactIdentifier,
        opening.tagName,
        opening.attributes,
        []
      ),
      end: opening.end
    };
  }

  const children: string[] = [];
  let index = opening.end;

  while (index < source.length) {
    if (source.startsWith('</', index)) {
      const closing = parseClosingElement(source, index);
      if (closing.tagName !== opening.tagName) {
        throwJsxError(
          'source.jsx.tag',
          `Native trusted block JSX tag '${opening.tagName}' was not closed before '${closing.tagName}'.`
        );
      }

      return {
        expression: createElementExpression(
          reactIdentifier,
          opening.tagName,
          opening.attributes,
          children
        ),
        end: closing.end
      };
    }

    if (isJsxStart(source, index)) {
      const child = parseJsxElement(source, index, options);
      children.push(child.expression);
      index = child.end;
      continue;
    }

    if (source[index] === '{') {
      const expression = consumeJsxExpression(source, index, 'children');
      const trimmed = expression.expression.trim();
      if (trimmed.length === 0) {
        throwJsxError(
          'source.jsx.children',
          'Native trusted block JSX expression children cannot be empty.'
        );
      }
      if (trimmed.startsWith('...')) {
        throwJsxError(
          'source.jsx.children',
          'Native trusted block JSX spread children are not supported.'
        );
      }
      children.push(`(${trimmed})`);
      index = expression.end;
      continue;
    }

    const textEnd = findTextEnd(source, index);
    const text = normalizeTextChild(source.slice(index, textEnd));
    if (text.length > 0) {
      children.push(JSON.stringify(text));
    }
    index = textEnd;
  }

  throwJsxError(
    'source.jsx.tag',
    `Native trusted block JSX tag '${opening.tagName}' is not closed.`
  );
}

function parseOpeningElement(
  source: string,
  start: number,
  options: NativeTrustedBlockJsxTransformOptions
): JsxOpeningElement {
  if (source.startsWith('<>', start)) {
    throwJsxError(
      'source.jsx.fragments',
      'Native trusted block JSX fragments are not supported.'
    );
  }

  let index = start + 1;
  const tagName = readIdentifier(source, index);
  if (!tagName) {
    throwJsxError(
      'source.jsx.tag',
      'Native trusted block JSX tag could not be transformed.'
    );
  }

  validateComponentTag(tagName.value, options.componentIdentifiers);
  index = tagName.end;

  const attributes: JsxAttribute[] = [];

  while (index < source.length) {
    index = skipWhitespace(source, index);

    if (source.startsWith('/>', index)) {
      return {
        tagName: tagName.value,
        attributes,
        selfClosing: true,
        end: index + 2
      };
    }

    if (source[index] === '>') {
      return {
        tagName: tagName.value,
        attributes,
        selfClosing: false,
        end: index + 1
      };
    }

    if (source.startsWith('{...', index)) {
      throwJsxError(
        'source.jsx.props',
        'Native trusted block JSX spread props are not supported.'
      );
    }

    const attribute = parseAttribute(source, index);
    attributes.push(attribute.attribute);
    index = attribute.end;
  }

  throwJsxError(
    'source.jsx.tag',
    `Native trusted block JSX tag '${tagName.value}' is not closed.`
  );
}

function parseAttribute(
  source: string,
  start: number
): { attribute: JsxAttribute; end: number } {
  const name = readIdentifier(source, start);
  if (!name) {
    throwJsxError(
      'source.jsx.props',
      'Native trusted block JSX prop could not be transformed.'
    );
  }

  if (name.value === 'dangerouslySetInnerHTML') {
    throwJsxError(
      'source.jsx.props.dangerouslySetInnerHTML',
      'Native trusted block JSX dangerouslySetInnerHTML is not supported.'
    );
  }

  let index = skipWhitespace(source, name.end);
  if (source[index] !== '=') {
    return {
      attribute: {
        name: name.value,
        value: 'true'
      },
      end: index
    };
  }

  index = skipWhitespace(source, index + 1);
  const char = source[index];

  if (char === '"' || char === "'") {
    const literal = readStringLiteral(source, index, char);
    return {
      attribute: {
        name: name.value,
        value: JSON.stringify(literal.value)
      },
      end: literal.end
    };
  }

  if (char === '{') {
    const expression = consumeJsxExpression(source, index, 'props');
    const trimmed = expression.expression.trim();
    if (trimmed.length === 0) {
      throwJsxError(
        'source.jsx.props',
        `Native trusted block JSX prop '${name.value}' expression cannot be empty.`
      );
    }
    if (trimmed.startsWith('...')) {
      throwJsxError(
        'source.jsx.props',
        'Native trusted block JSX spread props are not supported.'
      );
    }
    return {
      attribute: {
        name: name.value,
        value: `(${trimmed})`
      },
      end: expression.end
    };
  }

  throwJsxError(
    'source.jsx.props',
    `Native trusted block JSX prop '${name.value}' value could not be transformed.`
  );
}

function parseClosingElement(source: string, start: number): JsxClosingElement {
  let index = start + 2;
  const tagName = readIdentifier(source, index);
  if (!tagName) {
    throwJsxError(
      'source.jsx.tag',
      'Native trusted block JSX closing tag could not be transformed.'
    );
  }

  index = skipWhitespace(source, tagName.end);
  if (source[index] !== '>') {
    throwJsxError(
      'source.jsx.tag',
      `Native trusted block JSX closing tag '${tagName.value}' could not be transformed.`
    );
  }

  return {
    tagName: tagName.value,
    end: index + 1
  };
}

function consumeJsxExpression(
  source: string,
  start: number,
  position: 'props' | 'children'
): JsxExpression {
  let index = start + 1;
  let depth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '*') {
      throwJsxError(
        'source.jsx.comments',
        'Native trusted block JSX comments are not supported.'
      );
    }

    if (char === '/' && next === '/') {
      throwJsxError(
        'source.jsx.comments',
        'Native trusted block JSX comments are not supported.'
      );
    }

    if (char === '"' || char === "'") {
      index = consumeQuotedString(source, index, char);
      continue;
    }

    if (char === '`') {
      index = consumeTemplate(source, index);
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === '}' && depth === 0) {
      return {
        expression: source.slice(start + 1, index),
        end: index + 1
      };
    }

    if (char === '}' || char === ']' || char === ')') {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    index += 1;
  }

  throwJsxError(
    position === 'props' ? 'source.jsx.props' : 'source.jsx.children',
    'Native trusted block JSX expression is not closed.'
  );
}

function createElementExpression(
  reactIdentifier: string,
  tagName: string,
  attributes: JsxAttribute[],
  children: string[]
): string {
  const propsExpression =
    attributes.length === 0
      ? 'null'
      : `{ ${attributes
          .map((attribute) => `${attribute.name}: ${attribute.value}`)
          .join(', ')} }`;

  const args = [tagName, propsExpression, ...children];
  return `${reactIdentifier}.createElement(${args.join(', ')})`;
}

function validateComponentTag(
  tagName: string,
  componentIdentifiers: ReadonlySet<string>
): void {
  if (!isComponentIdentifier(tagName)) {
    throwJsxError(
      'source.jsx.tag',
      `Native trusted block JSX tag '${tagName}' must be an imported component identifier.`
    );
  }

  if (!componentIdentifiers.has(tagName)) {
    throwJsxError(
      'source.jsx.tag',
      `Native trusted block JSX tag '${tagName}' is not an allowed imported component.`
    );
  }
}

function isJsxStart(source: string, index: number): boolean {
  if (source[index] !== '<') {
    return false;
  }

  const next = source[index + 1];
  return next === '>' || isIdentifierStart(next);
}

function findTextEnd(source: string, start: number): number {
  let index = start;
  while (
    index < source.length &&
    source[index] !== '<' &&
    source[index] !== '{'
  ) {
    index += 1;
  }
  return index;
}

function normalizeTextChild(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function readIdentifier(
  source: string,
  start: number
): { value: string; end: number } | undefined {
  if (!isIdentifierStart(source[start])) {
    return undefined;
  }

  let index = start + 1;
  while (index < source.length && isIdentifierPart(source[index])) {
    index += 1;
  }

  return {
    value: source.slice(start, index),
    end: index
  };
}

function readStringLiteral(
  source: string,
  start: number,
  quote: '"' | "'"
): { value: string; end: number } {
  let index = start + 1;
  let value = '';

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      value += source[index + 1] ?? '';
      index += 2;
      continue;
    }

    if (char === quote) {
      return {
        value,
        end: index + 1
      };
    }

    value += char;
    index += 1;
  }

  throwJsxError(
    'source.jsx.props',
    'Native trusted block JSX string prop is not closed.'
  );
}

function consumeQuotedString(
  source: string,
  start: number,
  quote: '"' | "'"
): number {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function consumeTemplate(source: string, start: number): number {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '`') {
      return index + 1;
    }

    if (char === '$' && next === '{') {
      index = consumeTemplateExpression(source, index + 2);
      continue;
    }

    index += 1;
  }

  return source.length;
}

function consumeTemplateExpression(source: string, start: number): number {
  let index = start;
  let depth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      index = consumeLineComment(source, index + 2);
      continue;
    }

    if (char === '/' && next === '*') {
      index = consumeBlockComment(source, index);
      continue;
    }

    if (char === '"' || char === "'") {
      index = consumeQuotedString(source, index, char);
      continue;
    }

    if (char === '`') {
      index = consumeTemplate(source, index);
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === '}' && depth === 0) {
      return index + 1;
    }

    if (char === '}' || char === ']' || char === ')') {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    index += 1;
  }

  return source.length;
}

function consumeLineComment(source: string, start: number): number {
  const lineEnd = source.indexOf('\n', start);
  return lineEnd === -1 ? source.length : lineEnd + 1;
}

function consumeBlockComment(source: string, start: number): number {
  const commentEnd = source.indexOf('*/', start + 2);
  return commentEnd === -1 ? source.length : commentEnd + 2;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (isWhitespace(source[index])) {
    index += 1;
  }
  return index;
}

function isComponentIdentifier(value: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(value);
}

function isIdentifierStart(char: string | undefined): boolean {
  return typeof char === 'string' && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function isWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function throwJsxError(path: string, message: string): never {
  throw new NativeTrustedBlockJsxTransformError(path, message);
}

function createRuntimeError(
  path: string,
  message: string
): BlockProtocolError {
  return { code: 'runtime_error', path, message };
}
