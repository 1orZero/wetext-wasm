# wetext-wasm

A JavaScript and TypeScript port of the Python package
[WeTextProcessing](https://github.com/wenet-e2e/WeTextProcessing), using an
OpenFst WebAssembly runtime. Normalization runs locally without Python or an
API service.

All credit for the original package, normalization algorithms, language
grammars, and data belongs to the **WeTextProcessing authors and contributors**
and the projects they credit. This repository adapts their work for JavaScript
and TypeScript. Please visit the [original repository](https://github.com/wenet-e2e/WeTextProcessing)
for the Python implementation and its contributors.

The grammar source is pinned to
[WeTextProcessing c3b4d88](https://github.com/wenet-e2e/WeTextProcessing/tree/c3b4d88d11c5efef817881f7e515cbdd3a19d99b).
Python and Pynini compile the models during development. The distributed package
contains the JavaScript, WASM, and compiled models.

```text
Build:    Python grammars + dictionaries -> Pynini -> model files
Runtime:  TypeScript -> WASM/OpenFst -> tokens -> field ordering -> output
                          |                                      |
                          +---------- character mappings --------+
```

## Use

Install from [npm](https://www.npmjs.com/package/wetext-wasm):

```sh
npm install wetext-wasm
```

Uses ES modules and requires Node.js 22 or newer. CommonJS callers can use
`await import('wetext-wasm')`. For an offline installation, use
`npm install /path/to/wetext-wasm-0.2.0.tgz`.

```ts
import { createNormalizer } from 'wetext-wasm';

const normalizer = await createNormalizer(); // Chinese ITN
try {
  normalizer.normalize('二十三');       // '23'
  normalizer.normalize('百分之三十');   // '30%'
  normalizer.normalize('一二', { nbest: 3 }); // ['1~2', '一二']

  const result = normalizer.normalizeWithMapping('😀二十三');
  // result.output: '😀23'
  // result.mappings[0].input:  { start: 1, end: 4, text: '二十三' }
  // result.mappings[0].output: { start: 1, end: 3, text: '23' }
} finally {
  normalizer.dispose();
}
```

`createNormalizer({ language: 'en', direction: 'tn' })` selects another model.
TN turns written text into spoken text. ITN turns spoken text into written text.
Only the selected model is loaded into memory.

| Direction | Language codes |
| --- | --- |
| TN | `zh`, `en`, `ko`, `hy`, `ar`, `fr`, `pt`, `vi`, `ru`, `de`, `sv`, `es`, `hi`, `hu`, `he`, `it`, `mr`, `rw`, `ja` |
| ITN | All TN codes, plus `es_en` and `hi_en` |

These are the upstream language identifiers. Mixed Spanish/English and
Hindi/English have their own ITN models. Output spelling and punctuation follow
the pinned upstream grammars.

## Chinese ITN build options

Set `dictation` to `true` when compiling `zh-itn` to accept Traditional
Chinese number spellings (萬、億、兩、點、號、個), 〇, and 廿/卅. This option
keeps spoken digit sequences of three or more digits together, preserves
measurement units, and writes dates with 年/月/日/號. Text outside converted
fields keeps its original spelling and spaces.

`dictation` defaults to `false`. The npm package carries the 40 upstream default
models and the model compiler. Compile custom settings into a directory outside
the package's bundled `models/` directory, then load that directory through the
existing `model` argument. Building requires the tools listed under
[Build from source](#build-from-source); running the resulting model requires
only the JavaScript/WASM package.

From an installed npm package:

```sh
npm --prefix ./node_modules/wetext-wasm run setup
npm --prefix ./node_modules/wetext-wasm run models -- \
  --options '{"dictation":true}' --output /absolute/path/to/app/models/zh-itn
```

In a prepared source checkout, the equivalent command is:

```sh
npm run models -- --options '{"dictation":true}' --output build/models/zh-itn
```

Load the compiled files from your application:

```js
import { createNormalizer } from 'wetext-wasm';

const normalizer = await createNormalizer({
  model: new URL('./models/zh-itn/', import.meta.url),
});
try {
  normalizer.normalize('三萬五千');             // '35000'
  normalizer.normalize('兩萬三');               // '23000'
  normalizer.normalize('零三四八五四六');       // '0348546'
  normalizer.normalize('二〇二四');             // '2024'
  normalizer.normalize('廿七');                 // '27'
  normalizer.normalize('卅');                   // '30'
  normalizer.normalize('三十秒');               // '30秒'
  normalizer.normalize('二零二六年十一月四號'); // '2026年11月4號'
} finally {
  normalizer.dispose();
}
```

The existing `remove_interjections`, `enable_standalone_number`,
`enable_0_to_9`, and `enable_million` options can be combined with `dictation`.
Their defaults remain unchanged. For example,
`--options '{"dictation":true,"enable_0_to_9":true}'` also converts isolated
single digits. These are compile-time options; each configuration produces its
own model files. Browsers and Workers can load those files through the existing
URL or `{ manifest, tagger, verbalizer }` interface.

```text
zh-itn + default options   -> bundled model -> upstream behavior
zh-itn + dictation: true   -> custom files  -> Chinese dictation behavior
```

The grammar retains upstream ambiguity rules: `十分重要` becomes `10分重要`,
`七七八八` becomes `7788`, and `數一二三` becomes `數123`. Callers must decide
which passages contain numbers. `三三兩兩` is protected as a known phrase.
Large magnitudes remain segmented (`一億兩千萬` becomes `1億2000萬`), and
`M 一` stays unchanged. Currency formatting and range expressions such as
`四五十` → `40~50` retain their grammar behavior. English models are unchanged.

## API

Initialization is asynchronous; conversion methods are synchronous.

| Method | Result |
| --- | --- |
| `normalize(input, { nbest? })` | Normalized text, or an array of unique candidates when `nbest > 1` |
| `tag(input, { nbest? })` | Tagged token text, or an array of candidate token streams |
| `verbalize(tagged)` | Text produced from a tagged token stream, after field ordering |
| `normalizeWithMapping(input, { nbest?, includeIdentity? })` | `{ input, output, mappings }`, or an array of results when `nbest > 1` |
| `dispose()` | Releases the model graphs; safe to call more than once |

`nbest` defaults to 1 and must be a positive 32-bit integer. Fewer candidates
are returned when the graph has fewer distinct outputs. Empty input produces an
empty string or an empty mapping result. `includeIdentity` defaults to `false`;
set it to `true` to include unchanged tokens.

Mappings contain `kind` (`equal`, `replace`, or `delete`), `tokenType`, and
`input`/`output` spans. Offsets are **Unicode code point indices**, with an
exclusive end, matching Python. JavaScript's `slice()` uses UTF-16 indices;
use `Array.from(text).slice(start, end).join('')` with these spans. Separators
inserted between tokens can be outside all mappings.

Invalid model manifests, wrong checksums, malformed token streams, inputs with
unpaired surrogates, missing conversion paths, and use after disposal throw
errors. Models are pinned to this upstream revision and verified before use.
Callers should supply models from trusted sources; a checksum detects damaged
or mismatched files but does not authenticate their publisher.

## Browsers and Web Workers

Serve `dist/` and the required `models/<language>-<direction>/` directory as
static assets over HTTPS or localhost. Use the JavaScript entry point directly:

```js
import { createNormalizer } from './dist/index.js';

const normalizer = await createNormalizer({
  model: new URL('./models/zh-itn/', import.meta.url),
});
const result = normalizer.normalize('二十三');
normalizer.dispose();
```

Serve the WASM file as `application/wasm`. It is loaded relative to
`dist/wasm.js`. A bundler must preserve the WASM and model assets or pass explicit
locations. Use `runtime: { locateFile: (name) => assetBase + name }` to relocate
WASM, or `runtime: { wasmBinary: bytes }` to provide it directly. A model can also
be supplied as `{ manifest, tagger: Uint8Array, verbalizer: Uint8Array }`.
`loadModel(url)` loads and verifies a model directory.

Conversion can block the calling thread. Put a normalizer in a Web Worker for
interactive applications or long input. A normalizer owns native resources;
keep it for repeated calls, then dispose it when finished. The shared WASM
memory may retain its high-water allocation after individual graphs are freed.

## Cloudflare Workers

Use the source checkout's [`examples/cloudflare/`](examples/cloudflare/) to
verify the package with the `cf` CLI. `GET /qa` runs a fixed Chinese ITN
self-test. `GET /qa-parity` replays batches of Python reference calls for every
recorded language and configuration. The latter loads compressed models and
test cases through a static-assets binding. `GET /qa-extra` runs the direct
graph, parser, alignment, and candidate-weight assertions.

```sh
cd examples/cloudflare
npm ci
npm run test:prepare
npm run typecheck
npm run dev
```

In another terminal in the same directory:

```sh
npm test
npm run test:parity
npm run test:extra
npx cf deploy --dry-run
npx cf auth whoami
npm run deploy
npm test -- https://YOUR-WORKER.workers.dev
npm run test:parity -- https://YOUR-WORKER.workers.dev
npm run test:extra -- https://YOUR-WORKER.workers.dev
```

The test runner checks normalization, candidate order, character mapping,
recoverable errors, disposal, repeated requests, and four simultaneous requests.
It also checks the endpoint's 404 and 405 responses. The parity runner verifies
the deployed corpus, compares each result with Python, and checks every case ID
for missing, duplicate, or substituted entries. Large candidate requests start
in smaller batches. A Workers CPU-limit response splits the affected batch
until it passes or a single case fails; it never drops a case or reduces `nbest`.
Pass `models` after the URL to check just model initialization
and one call per configuration. This shorter check does not replace full parity.

Build the package, generate the bundled models, and run the Python reference
suite before preparing the example's test assets. Matching default
configurations use the bundled models. Alternative configurations use reference
snapshots. The Worker has no database bindings or scheduled jobs.

Workers require a [precompiled WASM module](https://developers.cloudflare.com/workers/runtime-apis/webassembly/).
Import `wetext-wasm/wetext.wasm` and pass it as
`runtime: { wasmModule }`; this takes precedence over `wasmBinary` and
`locateFile`. The runtime is built with `DYNAMIC_EXECUTION=0` so it does not
generate JavaScript with `eval` or `new Function`.

```text
cf build       -> Worker bundle + WASM + compressed model/test assets
GET /qa-parity -> load model -> verify -> instantiate -> compare batch -> dispose
```

The example uses compatibility date `2026-11-03`, which enables Node.js
compatibility by default, and opts into
[`new_module_registry`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#new-module-registry).
The registry supplies `import.meta.url`, which Emscripten's Node-compatible
loader needs. Keep these settings when adapting the example.

The example loads one model per request and sets a 30,000 ms CPU limit.
Per-request model initialization can exceed the Free plan's 10 ms budget.
Full-corpus parity checks correctness for the tested inputs and configurations;
it does not establish production throughput or compatibility with the Free
plan. See the recorded results in `overnight goal.md` and
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Build from source

Build prerequisites: Node.js 22+, npm, Git, CMake, Make, Python 3, `curl`, and
`tar`. The setup script installs pinned sources and local Emscripten/Pynini
tools under `vendor/` and `.tools/`; it does not edit shell profiles. macOS and
Linux are the source-build targets; use WSL on Windows.

```sh
npm ci
npm run setup
npm run build
npm run models -- --all
npm run test:reference
npm run typecheck
npm test
npm pack
```

`EMSDK` can select an existing Emscripten installation, and `WETEXT_PYTHON` can
select an existing Python interpreter with the required dependencies. The
pinned tool versions and source checksums are recorded in `sources.json`.

For only the default Chinese ITN model, run `npm run models`. Chinese TN enables
`traditional_to_simple` by default, following upstream. Constructor options are
selected when compiling a model, because they change the grammar:

```sh
npm run models -- --language zh --direction tn \
  --options '{"traditional_to_simple":false}' \
  --output models/zh-tn-traditional
```

Then load that model with `createNormalizer({ model: new URL('./models/zh-tn-traditional/', import.meta.url) })`.
Disabling `traditional_to_simple` preserves upstream behavior for that option;
it does not translate all upstream vocabulary into Traditional Chinese.

## Verify compatibility

```sh
npm run test:reference # Generate Python reference data and verify every test
npm run check          # Reuse reference data: types, package tests, full replay
```

`test:reference` runs the unmodified upstream pytest suite and records the
test IDs, exact Python results, expected errors, and model graphs. It also
captures direct graph queries, parser results, alignment traces, and candidate
weights from the relevant upstream tests, then verifies them in JavaScript/WASM.
`test:parity` repeats the verification using saved data. Default configurations
use the bundled models; other configurations use recorded model graphs.

The pinned suite has **27,178 test cases**. The coverage matrix accounts for
26,840 cases with JavaScript/WASM execution evidence, including 23 that also
contain Python build assertions. The other 338 cases check retained Python
build tools, test fixtures, or private implementation details. Their original
pytest assertions pass; they are listed separately from runtime parity.
The matrix fails if any test ID remains unaccounted for.

```text
Original pytest cases -> Processor calls -> Node/WASM + Workers
                     -> graph/parser/alignment/weight assertions -> both runtimes
                     -> retained Python tool assertions -> original pytest
                                      |
                         coverage matrix for every test ID
```

Generated data lives in `.test-data/qa-full-reference/`,
`qa-graph-reference/`, `qa-core-reference/`, and `qa-completion-reference/`.
The final matrix is `.test-data/qa-full-coverage/matrix.json`; its summary and
`unresolved.json` are in the same directory. A failed or incomplete upstream
run cannot count as a passing replay. Negative controls deliberately change
expected values to verify that the replay detects a mismatch.

`npm test` covers the JavaScript boundary, model loading, invalid input,
resource disposal, package installation, and 96 Python-generated edge cases.
The small fixtures are included in the source tree; `npm run test:fixtures`
regenerates them from upstream Python. `npm run typecheck` checks the TypeScript
source. The source checkout's `overnight goal.md` records validation results and
implementation decisions.

The package exposes the upstream normalization runtime. Python grammar-building
classes, the Python command-line program, and its disk-cache management remain
build-time tooling. It does not provide a JavaScript replacement for Pynini's
grammar-authoring API.

## Release to npm

These commands publish `wetext-wasm@0.2.0`. Start from a built checkout that has
passed the compatibility checks above. Create a fresh archive after any README
or license update so the published package includes it:

```sh
npm pack
shasum -a 256 wetext-wasm-0.2.0.tgz > wetext-wasm-0.2.0.tgz.sha256
npm publish ./wetext-wasm-0.2.0.tgz --dry-run --ignore-scripts
```

Sign in to the npm account that will own the package. Complete the browser
login, then check the username printed by `npm whoami`:

```sh
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

For this interactive workflow, enable two-factor authentication on the npm
account and complete any authentication prompt during publishing. See the
[npm publishing requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

The following command publishes a **public npm package**. A private GitHub
repository does not make the npm package private. Check the archive and account
before running it:

```sh
shasum -a 256 -c wetext-wasm-0.2.0.tgz.sha256
npm publish ./wetext-wasm-0.2.0.tgz --access public --registry=https://registry.npmjs.org/
npm view wetext-wasm@0.2.0 version dist.integrity --registry=https://registry.npmjs.org/
```

For later releases, use a new version and update the archive filename in these
commands. npm does not allow an already published name/version pair to be
reused. See the [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

## Licenses and attribution

This port uses **Apache-2.0**, the same license as the original
[WeTextProcessing](https://github.com/wenet-e2e/WeTextProcessing) project. The
[LICENSE](LICENSE) file is an unchanged copy from the pinned upstream revision.
Ported source files retain the original copyright and license headers and
identify the adaptation.

[Upstream copyright notices and acknowledgments](licenses/wetext.txt) preserve
credit for the original authors and their dependencies. Bundled third-party
components and data retain their respective licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [licenses/](licenses/).
These files are included in the npm archive.
