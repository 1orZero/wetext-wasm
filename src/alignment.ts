// Copyright (c) 2026, WENET COMMUNITY.
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
// Source: https://github.com/wenet-e2e/WeTextProcessing/blob/c3b4d88d11c5efef817881f7e515cbdd3a19d99b/tn/alignment.py

import type { Range } from "./tokens.js";
import type { Trace } from "./wasm.js";

export class AlignmentError extends Error {
  override name = "AlignmentError";
}

function boundaries(text: string): {
  characterToByte: number[];
  byteToCharacter: Map<number, number>;
  whitespace: boolean[];
} {
  const characterToByte = [0];
  const byteToCharacter = new Map([[0, 0]]);
  const whitespace: boolean[] = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let index = 0;
  for (const character of text) {
    const length = encoder.encode(character).length;
    const isWhitespace = /^[\p{White_Space}\u001c-\u001f]$/u.test(character);
    for (let byte = 0; byte < length; byte++) whitespace.push(isWhitespace);
    offset += length;
    characterToByte.push(offset);
    byteToCharacter.set(offset, ++index);
  }
  return { characterToByte, byteToCharacter, whitespace };
}

function byteSpans(characterToByte: number[], spans: Range[], rejectEmpty = false): Range[] {
  let previousEnd = 0;
  return spans.map(([start, end]) => {
    if (start < previousEnd || end < start || end >= characterToByte.length) {
      throw new AlignmentError("token spans must be ordered, non-overlapping character ranges");
    }
    if (rejectEmpty && start === end) throw new AlignmentError("input spans must not be empty");
    previousEnd = end;
    return [characterToByte[start]!, characterToByte[end]!] as const;
  });
}

function characterSpan(mapping: Map<number, number>, start: number, end: number): Range {
  const first = mapping.get(start);
  const last = mapping.get(end);
  if (first === undefined || last === undefined) {
    throw new AlignmentError("WFST path split a Unicode code point");
  }
  return [first, last];
}

export function traceInputSpans(input: string, tagged: string, trace: Trace, spans: Range[]): Range[] {
  const source = boundaries(input);
  const target = boundaries(tagged);
  const bytes = byteSpans(target.characterToByte, spans);
  const starts: (number | undefined)[] = new Array(bytes.length);
  const ends: (number | undefined)[] = new Array(bytes.length);
  let inputOffset = 0;
  let outputOffset = 0;
  let tokenIndex = 0;
  for (let index = 0; index < trace.arcs.length; index += 2) {
    const ilabel = trace.arcs[index]!;
    const olabel = trace.arcs[index + 1]!;
    const nextInput = inputOffset + (ilabel ? 1 : 0);
    while (tokenIndex < bytes.length && outputOffset >= bytes[tokenIndex]![1]) tokenIndex++;
    let owner: number | undefined;
    if (tokenIndex < bytes.length) {
      const [start, end] = bytes[tokenIndex]!;
      if (ilabel && start <= outputOffset && outputOffset < end && (outputOffset !== start || olabel)) {
        const leadingSpace = !olabel && source.whitespace[inputOffset] && starts[tokenIndex] === undefined;
        if (!leadingSpace) owner = tokenIndex;
      } else if (ilabel && olabel && outputOffset + 1 === start && !source.whitespace[inputOffset]) {
        owner = tokenIndex;
      }
    }
    if (owner !== undefined) {
      starts[owner] ??= inputOffset;
      ends[owner] = nextInput;
    }
    inputOffset = nextInput;
    outputOffset += olabel ? 1 : 0;
  }
  return bytes.map((_, index) => {
    const start = starts[index];
    const end = ends[index];
    if (start === undefined || end === undefined) throw new AlignmentError("tagged token did not consume any input");
    return characterSpan(source.byteToCharacter, start, end);
  });
}

export function traceOutputSpans(input: string, trace: Trace, spans: Range[]): Range[] {
  if (!spans.length) return [];
  const source = boundaries(input);
  const target = boundaries(trace.text);
  const bytes = byteSpans(source.characterToByte, spans, true);
  const starts: (number | undefined)[] = new Array(bytes.length);
  const ends: (number | undefined)[] = new Array(bytes.length);
  const offsets = new Map<number, number>();
  let inputOffset = 0;
  let outputOffset = 0;
  let tokenIndex = 0;
  for (let index = 0; index < trace.arcs.length; index += 2) {
    const ilabel = trace.arcs[index]!;
    const olabel = trace.arcs[index + 1]!;
    offsets.set(inputOffset, outputOffset);
    while (tokenIndex < bytes.length && inputOffset >= bytes[tokenIndex]![1]) tokenIndex++;
    let owner: number | undefined;
    if (ilabel) {
      if (tokenIndex < bytes.length) {
        const [start, end] = bytes[tokenIndex]!;
        if (start <= inputOffset && inputOffset < end) owner = tokenIndex;
      }
    } else {
      if (tokenIndex < bytes.length) {
        const [start, end] = bytes[tokenIndex]!;
        if ((start < inputOffset && inputOffset < end) || (tokenIndex === 0 && inputOffset === start)) {
          owner = tokenIndex;
        }
      }
      if (owner === undefined && olabel && !target.whitespace[outputOffset]) {
        const previous = tokenIndex - 1;
        if (previous >= 0 && bytes[previous]![1] <= inputOffset) owner = previous;
      }
    }
    if (olabel && owner !== undefined) {
      starts[owner] ??= outputOffset;
      ends[owner] = outputOffset + 1;
    }
    inputOffset += ilabel ? 1 : 0;
    outputOffset += olabel ? 1 : 0;
  }
  offsets.set(inputOffset, outputOffset);
  if (inputOffset !== source.characterToByte.at(-1) || outputOffset !== target.characterToByte.at(-1)) {
    throw new AlignmentError("WFST path offsets do not match its input/output strings");
  }
  let previousEnd = 0;
  return bytes.map(([inputStart], index) => {
    const start = starts[index];
    const outputStart = start ?? Math.max(offsets.get(inputStart) ?? outputOffset, previousEnd);
    const outputEnd = ends[index] ?? outputStart;
    if (outputStart < previousEnd) throw new AlignmentError("token output spans overlap or are out of order");
    previousEnd = outputEnd;
    return characterSpan(target.byteToCharacter, outputStart, outputEnd);
  });
}
