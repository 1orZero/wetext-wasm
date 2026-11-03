export interface Token {
  name: string;
  start: number;
  end: number;
  fields: Map<string, string>;
}

export type Range = readonly [number, number];

export class TokenParseError extends Error {
  override name = "TokenParseError";
}

export function parseTokens(input: string): Token[] {
  if (!input) throw new TokenParseError("token stream must not be empty");
  const text = Array.from(input);
  let position = 0;
  const fail = (message: string): never => {
    throw new TokenParseError(`${message} at position ${position}`);
  };
  const expect = (value: string): void => {
    for (const character of value) {
      if (text[position] !== character) fail(`expected ${JSON.stringify(value)}`);
      position++;
    }
  };
  const spaces = (): void => { while (text[position] === " ") position++; };
  const key = (): string => {
    const start = position;
    while (position < text.length && /^[A-Za-z_]$/.test(text[position]!)) position++;
    if (start === position) fail("expected token key");
    return text.slice(start, position).join("");
  };
  const tokens: Token[] = [];
  spaces();
  while (position < text.length) {
    const start = position;
    const name = key();
    expect(" { ");
    const fields = new Map<string, string>();
    spaces();
    while (text[position] !== "}") {
      const field = key();
      if (fields.has(field)) fail(`duplicate field ${field}`);
      expect(': "');
      let value = "";
      while (text[position] !== '"') {
        const character = text[position++];
        if (character === undefined) fail("unterminated token value");
        if (character === "\\") {
          const escaped = text[position++];
          if (escaped === undefined) fail("unterminated escape");
          value += escaped === '"' || escaped === "\\" ? escaped : `\\${escaped}`;
        } else {
          value += character;
        }
      }
      expect('"');
      fields.set(field, value);
      spaces();
    }
    expect("}");
    tokens.push({ name, fields, start, end: position });
    spaces();
  }
  return tokens;
}

export function reorderTokens(tokens: Token[], orders: Record<string, string[]>): {
  text: string;
  spans: Range[];
} {
  const values: string[] = [];
  const spans: Range[] = [];
  let offset = 0;
  for (const token of tokens) {
    const keys = [...token.fields.keys()];
    const canonical = Object.hasOwn(orders, token.name) ? orders[token.name] : undefined;
    const order = canonical && token.fields.get("preserve_order") !== "true"
      ? [...canonical, ...keys.filter(key => !canonical.includes(key))] : keys;
    let value = `${token.name} {`;
    for (const key of order) {
      const field = token.fields.get(key);
      if (field !== undefined) {
        const escaped = field.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        value += ` ${key}: "${escaped}"`;
      }
    }
    value += " }";
    if (values.length) offset++;
    const start = offset;
    offset += Array.from(value).length;
    spans.push([start, offset]);
    values.push(value);
  }
  return { text: values.join(" "), spans };
}
