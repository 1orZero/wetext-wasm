// Copyright (c) 2022 Zhendong Peng (pzd17@tsinghua.org.cn)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified from the Python implementation for the wetext-wasm TypeScript runtime.
// Source: https://github.com/wenet-e2e/WeTextProcessing/blob/c3b4d88d11c5efef817881f7e515cbdd3a19d99b/tn/token_parser.py

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
