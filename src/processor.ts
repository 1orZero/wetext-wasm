// Candidate ordering follows WeTextProcessing tn/processor.py (Apache-2.0).
import { traceInputSpans, traceOutputSpans } from "./alignment.js";
import { parseTokens, reorderTokens } from "./tokens.js";
import type { MappingOptions, ModelManifest, NormalizationResult, NormalizeOptions } from "./types.js";
import type { NativeGraph, NativeLattice, WasmModule, WeightedOutput } from "./wasm.js";

export function nativeCall<T>(module: WasmModule, call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (typeof error === "object" && error !== null && "excPtr" in error) {
      const [name, message] = module.getExceptionMessage(error);
      module.decrementExceptionRefcount(error);
      throw new Error(message || name);
    }
    throw error;
  }
}

interface RankedOutput extends WeightedOutput { rank: number }

class PathStream {
  private items: WeightedOutput[] = [];
  private yielded = new Set<string>();
  private rank = 0;
  private limit = 0;
  private exhausted = false;

  constructor(private module: WasmModule, readonly lattice: NativeLattice) {}

  peek(): RankedOutput | undefined {
    while (!this.items.length && !this.exhausted) {
      this.limit = this.limit ? this.limit * 2 : 1;
      if (this.limit > 2147483647) throw new RangeError("Too many WFST paths");
      const paths = nativeCall(this.module, () => this.lattice.paths(this.limit));
      const seen = new Set<string>();
      this.items = paths.filter(path => {
        if (seen.has(path.text) || this.yielded.has(path.text)) return false;
        seen.add(path.text);
        return true;
      });
      this.exhausted = paths.length < this.limit;
    }
    const item = this.items[0];
    return item && { ...item, rank: this.rank };
  }

  pop(): RankedOutput | undefined {
    const item = this.peek();
    if (item) {
      this.yielded.add(item.text);
      this.items.shift();
      this.rank++;
    }
    return item;
  }
}

interface Candidate {
  tagged: RankedOutput;
  output: RankedOutput;
  bestWeight: number;
  stream: PathStream;
  serial: number;
}

function weight(candidate: Candidate): number {
  return candidate.tagged.weight + candidate.output.weight - candidate.bestWeight;
}

function compare(a: Candidate, b: Candidate): number {
  return weight(a) - weight(b) || a.tagged.rank - b.tagged.rank || a.output.rank - b.output.rank || a.serial - b.serial;
}

function validateInput(input: string): void {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  for (const character of input) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) throw new TypeError("input contains an unpaired Unicode surrogate");
  }
}

function validateNbest(nbest: number): void {
  if (!Number.isSafeInteger(nbest) || nbest < 1 || nbest > 2147483647) {
    throw new RangeError("nbest must be a positive 32-bit integer");
  }
}

export class Normalizer {
  private disposed = false;

  constructor(
    readonly model: ModelManifest,
    private module: WasmModule,
    private tagger: NativeGraph,
    private verbalizer: NativeGraph,
  ) {}

  private validate(input: string, nbest = 1): void {
    if (this.disposed) throw new Error("Normalizer has been disposed");
    validateInput(input);
    validateNbest(nbest);
  }

  tag(input: string, options?: { nbest?: 1 }): string;
  tag(input: string, options: NormalizeOptions): string | string[];
  tag(input: string, { nbest = 1 }: NormalizeOptions = {}): string | string[] {
    this.validate(input, nbest);
    if (!input) return nbest === 1 ? "" : [""];
    if (nbest === 1) return nativeCall(this.module, () => this.tagger.trace(input, "", false)).text;
    const lattice = nativeCall(this.module, () => this.tagger.lattice(input));
    try {
      return nativeCall(this.module, () => lattice.paths(nbest)).map(path => path.text);
    } finally {
      lattice.delete();
    }
  }

  verbalize(input: string): string {
    this.validate(input);
    if (!input) return "";
    const reordered = reorderTokens(parseTokens(input), this.model.tokenOrders);
    return nativeCall(this.module, () => this.verbalizer.trace(reordered.text, "", false)).text;
  }

  normalize(input: string, options?: { nbest?: 1 }): string;
  normalize(input: string, options: NormalizeOptions): string | string[];
  normalize(input: string, { nbest = 1 }: NormalizeOptions = {}): string | string[] {
    this.validate(input, nbest);
    if (!input) return nbest === 1 ? "" : [""];
    const outputs = this.candidates(input, nbest).map(candidate => candidate.output.text);
    return nbest === 1 ? outputs[0]! : outputs;
  }

  normalizeWithMapping(input: string, options?: MappingOptions & { nbest?: 1 }): NormalizationResult;
  normalizeWithMapping(input: string, options: MappingOptions): NormalizationResult | NormalizationResult[];
  normalizeWithMapping(input: string, { nbest = 1, includeIdentity = false }: MappingOptions = {}): NormalizationResult | NormalizationResult[] {
    this.validate(input, nbest);
    if (typeof includeIdentity !== "boolean") throw new TypeError("includeIdentity must be a boolean");
    if (!input) {
      const result = { input: "", output: "", mappings: [] };
      return nbest === 1 ? result : [result];
    }
    const results = this.candidates(input, nbest).map(candidate => {
      const tokens = parseTokens(candidate.tagged.text);
      const reordered = reorderTokens(tokens, this.model.tokenOrders);
      const outputTrace = nativeCall(this.module, () => this.verbalizer.trace(reordered.text, candidate.output.text, true));
      const inputTrace = nativeCall(this.module, () => this.tagger.trace(input, candidate.tagged.text, true));
      const inputSpans = traceInputSpans(input, candidate.tagged.text, inputTrace, tokens.map(token => [token.start, token.end]));
      const outputSpans = traceOutputSpans(reordered.text, outputTrace, reordered.spans);
      const source = Array.from(input);
      const target = Array.from(outputTrace.text);
      const mappings: NormalizationResult["mappings"] = [];
      tokens.forEach((token, index) => {
        const [inputStart, inputEnd] = inputSpans[index]!;
        const [outputStart, outputEnd] = outputSpans[index]!;
        const inputText = source.slice(inputStart, inputEnd).join("");
        const outputText = target.slice(outputStart, outputEnd).join("");
        const kind = inputText === outputText ? "equal" : outputText ? "replace" : "delete";
        if (includeIdentity || kind !== "equal") mappings.push({
          kind,
          tokenType: token.name,
          input: { start: inputStart, end: inputEnd, text: inputText },
          output: { start: outputStart, end: outputEnd, text: outputText },
        });
      });
      return { input, output: outputTrace.text, mappings };
    });
    return nbest === 1 ? results[0]! : results;
  }

  private candidates(input: string, nbest: number): Candidate[] {
    const streams: PathStream[] = [];
    const stream = (graph: NativeGraph, text: string): PathStream => {
      const result = new PathStream(this.module, nativeCall(this.module, () => graph.lattice(text)));
      streams.push(result);
      return result;
    };
    try {
      const tags = stream(this.tagger, input);
      const frontier: Candidate[] = [];
      const outputs = new Set<string>();
      const candidates: Candidate[] = [];
      let activated = 0;
      const activate = (): boolean => {
        const tagged = tags.pop();
        if (!tagged) return false;
        const reordered = reorderTokens(parseTokens(tagged.text), this.model.tokenOrders);
        const verbalized = stream(this.verbalizer, reordered.text);
        const output = verbalized.pop();
        activated++;
        if (output) frontier.push({ tagged, output, stream: verbalized, bestWeight: output.weight, serial: activated });
        return true;
      };
      while (candidates.length < nbest) {
        const next = tags.peek();
        if (!frontier.length) {
          if (!activate()) break;
          continue;
        }
        frontier.sort(compare);
        const first = frontier[0]!;
        if (next && (next.weight < weight(first) || (next.weight === weight(first) && next.rank < first.tagged.rank))) {
          activate();
          continue;
        }
        const candidate = frontier.shift()!;
        if (!outputs.has(candidate.output.text)) {
          outputs.add(candidate.output.text);
          candidates.push(candidate);
          if (candidates.length === nbest) break;
        }
        const output = candidate.stream.pop();
        if (output) frontier.push({ ...candidate, output });
      }
      if (!candidates.length) throw new Error("no normalization path for the requested input");
      return candidates;
    } finally {
      for (const stream of streams) stream.lattice.delete();
    }
  }

  dispose(): void {
    if (!this.disposed) {
      this.tagger.delete();
      this.verbalizer.delete();
      this.disposed = true;
    }
  }
}
