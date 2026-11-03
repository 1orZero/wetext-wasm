# Third-party notices

The package contains code and compiled grammar data from the following projects.

| Component | Version | License and attribution |
| --- | --- | --- |
| WeTextProcessing grammars and runtime algorithms | `c3b4d88d11c5efef817881f7e515cbdd3a19d99b` | Apache-2.0; copyright 2022 Zhendong Peng and the WeTextProcessing contributors |
| OpenFst | `91c84cb37818505c4fcaae1ae97e49bb3348e1bf` (1.8.5) | Apache-2.0; copyright 2005-2026 Google LLC; [notice](licenses/openfst.txt) |
| Pynini C++ path iterator | 2.1.7 | Apache-2.0; copyright 2016-2025 Google LLC; [license](licenses/pynini.txt) |
| Emscripten runtime | 6.0.13 | MIT, selected from the offered MIT/NCSA dual license; copyright the Emscripten authors; [license](licenses/emscripten.txt) |
| musl C library | Included in Emscripten 6.0.13 | MIT and the included component notices; [copyright file](licenses/musl.txt) |
| LLVM libc++, libc++abi, compiler runtime | Included in Emscripten 6.0.13 | Apache-2.0 with LLVM exceptions and legacy notices; [libc++](licenses/llvm.txt), [libc++abi](licenses/libcxxabi.txt), [compiler-rt](licenses/compiler-rt.txt) |
| English name corpus | Upstream grammar data | Copyright January 1991 Mark Kantrowitz; the [original README and redistribution terms](licenses/name-corpus.md) are included |

`src/processor.ts`, `src/tokens.ts`, and `src/alignment.ts` adapt the
WeTextProcessing runtime algorithms to TypeScript. The grammar rules and data
are compiled without semantic changes. WeTextProcessing credits the NVIDIA
NeMo Text Processing team and community for grammar resources.

The Apache License text is in [LICENSE](LICENSE). Source URLs, revisions, and
archive checksums are recorded in `sources.json` in the source distribution.
