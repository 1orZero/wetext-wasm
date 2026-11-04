# WeTextProcessing TypeScript＋WASM 完成紀錄

狀態：實作、完整測試覆蓋、PersonalSpace 搬移、GitHub 公開與 npm `0.1.0` 發布均已完成。日期：2026-11-04。

目前工作目錄：`/Users/derek/PersonalSpace/wetext-wasm`。GitHub：[1orZero/wetext-wasm](https://github.com/1orZero/wetext-wasm)，可見性為 Public。搬移與發布驗證見文末。

套件可建置與離線安裝，執行階段不需要 Python。27,178 個上游案例已有完整對應，沒有未解項目：26,840 個具備 JavaScript／WASM 執行證據，其中 23 個另含保留的 Python 斷言；338 個只驗證 Python 建置工具、fixture 或私有實作。原 pytest 全數通過。50,864 筆 Processor 與 3,141 筆額外斷言均已通過 Node.js、本機及雲端 Workers。最終封裝已驗證，獨立覆核未發現阻擋發行準備的問題。

## 最終驗證

| 檢查 | 結果 | 證據 |
| --- | --- | --- |
| 上游 pytest | 27,178／27,178，沒有跳過 | `.test-data/qa-full-reference/summary.json`、`events.jsonl` |
| 逐項覆蓋 | 27,178 個 nodeid，未解 0；Python 專屬與混合斷言分列 | `.test-data/qa-full-coverage/matrix.json`、`README.md` |
| Node.js | 型別、23 項套件／API 測試、50,864 筆 Processor 與全部補充斷言通過 | `.tools/final-check.log`、各 `qa-*-coverage/` |
| Workers 本機／雲端完整重播 | 各 50,864 筆，144 組模型，46 個預期例外，0 失敗 | `.test-data/qa-cf-full-parity-{local,remote}.json` |
| Workers 本機／雲端補充斷言 | 各 3,141 筆，328 批，0 失敗 | `.test-data/qa-cf-extra-{local,remote}.json` |
| 最終雲端 API 檢查 | 10 次請求通過，包含四個同時請求及 404／405 | `.test-data/qa-cf-final-smoke.json` |
| 發行封裝 | 離線安裝、ES modules、CommonJS 動態載入、TypeScript 與雜湊檢查通過 | `.tools/npm-release-package.log`、`.test-data/qa-npm-release-package.json` |
| npm 發布與安裝 | `wetext-wasm@0.1.0` 已公開發布；從 registry 安裝、封裝雜湊、中英文基本轉換與三種呼叫方式均通過 | `.test-data/qa-npm-published.json` |
| 獨立覆核 | 未發現阻擋發行準備的問題；範圍為收據、關鍵程式與原測試抽查 | `.test-data/qa-final-review/README.md` |

以下保留實作決策與各階段紀錄。最終結果以本節為準。

## 交付檔案

- 套件：[`wetext-wasm-0.1.0.tgz`](wetext-wasm-0.1.0.tgz)，21,511,458 bytes，包含 40 組預設模型。
- 雜湊檔：[`wetext-wasm-0.1.0.tgz.sha256`](wetext-wasm-0.1.0.tgz.sha256)。
- 使用、建置與模型選項：[README.md](README.md)。
- 授權與第三方聲明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、`licenses/`。
- 原始碼：`src/`、`native/`；建置與比對工具：`scripts/`。

SHA-256：

```text
700c96f848f9edd5a9965ddcfd408cbd7a41a011be16a6ba5fe39298df842f2a
```

目前交付檔已包含新版 README、原作者版權與移植聲明；它與最新通過離線安裝的封裝檔逐位元相同，另已核對 SHA-512、全部授權檔與 40 組模型。更新前的封裝與雜湊檔保留於 `.test-data/qa-before-attribution/`。初版曾通過瀏覽器 QA；Cloudflare 相容修正後已重跑 Node.js 與 Cloudflare Workers 驗證，未重跑瀏覽器 QA。

安裝方式：

```sh
npm install wetext-wasm
```

## 實作範圍

提供 `normalize()`、`tag()`、`verbalize()`、`normalizeWithMapping()`、多候選結果與 `dispose()`。模型支援上游全部 19 組 TN、21 組 ITN 預設語言／方向組合。其他建置選項由規則匯出工具處理。

```text
建置階段：Python 規則與字典 -> Pynini -> 模型檔案

執行階段：TypeScript -> WASM／OpenFst -> 欄位排序 -> 正規化結果
                            |                         |
                            +------- 字元位置對應 -----+
```

## 自主決策與原因

1. 在 `wetext-wasm/` 建立獨立套件，保留 dotfiles 既有變更。未切換分支，也未 commit。根目錄只更新 `DEPENDENCIES.md`。
2. 固定 WeTextProcessing `c3b4d88d11c5efef817881f7e515cbdd3a19d99b`。`sources.json` 記錄 WeTextProcessing、OpenFst、Pynini 與 Emscripten SDK 的來源版本及封存檔 SHA-256。
3. Python／Pynini 僅用於編譯規則與產生獨立的比對基準。執行階段由 TypeScript 與 WASM 完成。
4. 上游 C++ 介面只提供單一結果，因此在 TypeScript 補齊 Python 的候選排序、標記解析與位置對應；保留 OpenFst 運算及 Pynini 2.1.7 的 C++ 路徑列舉器。
5. 位置採用 Python 的 Unicode code-point 索引，結尾不包含在範圍內。README 說明它與 JavaScript UTF-16 索引的差異及切片方式。
6. 工具鏈放在 `.tools/`，來源放在 `vendor/`，不修改全域 shell 或工具設定。`npm run setup` 可重複執行，也可使用指定的 Emscripten／Python。
7. 交付全部 40 組預設模型，但初始化只載入選定的語言與方向。這樣保留完整語言範圍，也避免一次載入全部模型。
8. 模型 manifest 包含來源版本、選項、欄位順序、檔案大小及 SHA-256。載入前驗證完整性。雜湊可檢查損毀或混用，不能證明發行者身分；README 要求使用可信來源的模型。
9. 建置選項在匯出模型時選定，例如 `npm run models -- --options ...`。套件保留上游語言與簡繁預設；中文 TN 預設開啟 `traditional_to_simple`。關閉此選項的建置指令已寫入 README，但這不等於將所有詞彙轉成台灣正體中文。
10. JavaScript 端提供正規化執行功能。Pynini 的規則撰寫 API、Python CLI 與 Python 磁碟快取保留為建置工具，不載入 Node.js 或瀏覽器執行階段。
11. 採用 ES modules。Node.js 最低版本為 22；CommonJS 呼叫端可用動態 `import()`。瀏覽器以靜態資產載入 WASM 與模型；較長輸入建議放在 Web Worker 執行。
12. 使用 Ponytail 控制範圍，以 test-audit 檢查測試價值。預期結果來自固定版本 Python 與上游案例，未以新 JavaScript 實作自身產生預期值。
13. 獨立匯出模型與 Python 測試快照的 SHA-256 不同。檢查確認 80 份 FST 的差異僅在已計算屬性的檔頭位元（位移 36–39），規則資料相同。仍以實際交付模型重新跑完整比對，結果全部一致。
14. 依使用者的 QA 規則，獨立檢查使用 `gpt-6-sol`、medium。子代理唯讀檢查程式，並實測瀏覽器主執行緒與 module Web Worker。
15. 套件附上 WeTextProcessing、OpenFst、Pynini、Emscripten、musl、LLVM 與英文姓名資料的授權／聲明。它不是 Stow package，因此不執行 Stow。
16. 未發布至 npm。交付可直接安裝的本機封裝檔，保留之後選擇套件名稱、版本與發布位置的空間。

## 前期驗證結果

| 檢查 | 結果 | 證據 |
| --- | --- | --- |
| 上游完整 pytest | 27,178 通過，0 失敗；612.88 秒 | `.tools/upstream-tests.log` |
| Python 測試快照的 JavaScript 比對 | 48,505 筆呼叫、55 組設定，0 差異 | `.tools/parity.log` |
| 實際交付模型的 JavaScript 比對 | 相同 48,505 筆呼叫，40 組預設使用交付模型，其他 15 組使用設定快照；0 差異 | `.test-data/qa-parity-summary.json`、`.tools/cf-regression.log` |
| JavaScript 測試 | 21 項通過，包含 96 筆 Python 產生的核心邊界案例 | `.tools/cf-regression.log`、`test/fixtures/qa-core/` |
| 最終封裝檔安裝 | 離線安裝成功；JavaScript 與 TypeScript 呼叫通過，授權檔案齊全 | `.tools/cf-package-final.log`、`.test-data/qa-package-summary.json` |
| TypeScript 型別檢查 | 通過 | `npm run typecheck` |
| 設定程序 | `npm run setup` 執行兩次皆通過，四份來源封存檔與安裝標記雜湊一致 | `.tools/setup-repeat.log`、`sources.json` |
| 乾淨來源建置 | 從固定封存檔重建來源、編譯 WASM、產生中文模型，數字轉換與 emoji 位置檢查通過 | `.tools/clean-build.log`、`.test-data/qa-clean-build.txt` |
| 初版的瀏覽器主執行緒與 module Worker | 數字、百分比、多候選、tag／verbalize、emoji 位置、dispose 與 fetch 載入皆通過 | `.test-data/qa-browser/qa-result.json` |
| 獨立程式檢查 | 未發現可重現缺陷 | 已完成的 QA 子代理回報 |
| 交付封裝檔 | 大小、SHA-512、SHA-256 與 40 組模型清單已核對 | `wetext-wasm-0.1.0.tgz.sha256` |

48,505 筆呼叫包含 `normalize` 17,879 筆、`normalizeWithMapping` 10,329 筆、`tag` 10,278 筆與 `verbalize` 10,019 筆。比對重跑相同案例，不重複計算為不同案例。

上游測試有 38 個 pytest 參數寫法的棄用警告，沒有失敗或跳過測試。HTTP 載入測試需要允許本機 loopback 連線；初次受沙箱限制的測試已改用適當權限重跑並通過。

乾淨來源建置使用與主建置相同的已安裝 Emscripten／Python 工具鏈。它驗證封存檔取得後的來源重建與編譯流程，未另外在第二台電腦重新安裝工具鏈。

## 本機量測

Cloudflare 相容修正前的本機量測：macOS arm64、Node.js 22.23.4，中文 ITN 初始化約 106 ms。100 次短句轉換的中位數約 1.52 ms，P95 約 3.88 ms。量測資料與輸入樣本保留於 `.test-data/qa-benchmark.json`；這些數字只代表該版本、機器與短句樣本。

更新後的完整套件未壓縮為 195,451,896 bytes，封裝檔為 21,507,881 bytes。模型圖會在 `dispose()` 時釋放；共用 WASM 記憶體可能保留曾配置的容量。

## 保留資料與未驗證範圍

- Python 比對資料與模型快照：`.test-data/qa-reference/`。
- 瀏覽器測試頁、Worker 與實際結果：`.test-data/qa-browser/`。測試分頁與暫時 HTTP 伺服器已關閉。
- 離線安裝與乾淨建置的隔離目錄位置：`.test-data/qa-package-summary.json`、`.test-data/qa-clean-build.txt`。測試資料保留，未刪除。
- 尚未在其他瀏覽器或 Linux／Windows 主機實測。所有語言模型已在本機 Node.js 比對；瀏覽器與 Worker 的實測模型為中文 ITN。
- 未修改或整合 Hex／VoiceInk，也未處理它們原有的變更。

初版目標已完成。Cloudflare Workers 的追加要求與目前進度如下；發布與產品整合留待後續指示。

## Cloudflare Workers 追加驗證

狀態：完成。已依使用者要求，以 `cf` CLI 確認中文 ITN 能在 Cloudflare Workers 執行。

- 以 `cf dev` 重現舊載入器的初始化失敗。Workers 舊版模組登錄未提供 `import.meta.url`，使 Emscripten 的 `createRequire()` 失敗。
- `RuntimeOptions` 新增 `wasmModule`，讓 Workers 使用部署時已編譯的 WASM。建置加入 `DYNAMIC_EXECUTION=0`，符合 Workers 的 JavaScript 執行限制。
- 新增 `examples/cloudflare/`。以 `cloudflare.config.ts` 設定 Worker，`wrangler.config.ts` 指定 FST 二進位模組；所有開發、建置與部署入口使用 `cf`。
- 固定 cf `1.0.0-beta.27`、Wrangler `4.157.0`；相容日期為 `2026-11-03`，加入 `new_module_registry` 以提供模組 URL。
- 使用現有 Cloudflare 登入，建立新的 `qa-wetext-wasm`，未修改其他 Worker。沒有建立儲存資源或排程。
- 雲端測試位置：[qa-wetext-wasm /qa](https://qa-wetext-wasm.derek-0dd.workers.dev/qa)。版本：`230731ea-c32d-463a-9fbb-f8c0cd3175b5`。
- `cf deploy --dry-run`、Worker 型別檢查、雲端部署均通過。部署輸出：未壓縮 4,106.45 KiB、gzip 670.75 KiB，Worker 啟動 36 ms；啟動數字不含請求內的模型初始化。
- 本機與雲端各 10 次驗證請求通過，包含數字、百分比、多候選、tag／verbalize、emoji 位置、錯誤後繼續使用、dispose、重複及 4 個同時請求、404／405。證據：`.test-data/qa-cf-local-suite.json`、`.test-data/qa-cf-remote.json`。
- 修正後的 21 項套件測試與完整 48,505 筆 Python 比對全部通過，0 差異；比對耗時 251.13 秒。證據：`.tools/cf-regression.log`。
- 更新後的封裝檔已通過離線安裝與 JavaScript／TypeScript 呼叫驗證，SHA-256 已更新；證據：`.tools/cf-package-final.log`。
- 獨立 QA 使用 `gpt-6-sol`、medium，未發現可重現缺陷。Worker 型別檢查通過；另重跑本機與雲端各 10 個請求，均符合預期。證據：`.test-data/qa-cf-review/results.json`。
- 最後核對封裝檔 SHA-256 通過。`cf dev` 本機伺服器已關閉，沒有待完成的檢查或執行中的本機作業。

本次雲端範圍為中文 ITN 短句。未測試其他語言、大量流量或 Workers Free 方案；範例 CPU 上限為 1,000 ms。保留 `qa-` Worker 與測試資料，依使用者的 QA 規則不刪除。

## 全部上游測試與 npm 發行準備

使用者補充完成標準：整個 Python 套件的所有測試都必須覆蓋，包含中文、英文及全部語言。完成後準備 npm 發行，但由使用者明天決定並執行；本工作階段不發布。

目前發現原本的 48,505 筆比對只擷取完整 normalizer 的呼叫，沒有逐項記錄 pytest 測試 ID。中文與英文的個別規則、直接 FST 運算、parser，以及建置工具的測試需另外盤點，不能將已通過的呼叫數當成所有上游測試的 JavaScript 覆蓋數。

待完成：

1. 建立 27,178 個上游測試的對應與分類，補齊 JavaScript 驗證缺口。
2. 以完整案例驗證 Workers 中的所有語言／方向與測試設定，逐項記錄失敗並修正。
3. 獨立核對覆蓋數、通過數、未涵蓋項目及平台限制。
4. 更新最終封裝、授權、發行內容及 npm 發行準備檢查；不執行 `npm publish`。

### 覆蓋盤點後的接續工作

上游盤點已完成：27,178 個參數化測試、93 個測試檔、735 個測試函式。詳見 `.test-data/qa-coverage-audit/README.md` 與 `inventory.json`。原始 48,505 筆比對沒有 nodeid，因此不能宣稱逐項全覆蓋。

下一階段由測試子代理補齊 `qa-full-reference` 與 Node.js 重播，主代理接續 Workers 全語言完整重播、修正產品差異及 npm 發行準備。原始 `qa-reference` 資料保留。只有主代理更新本紀錄。

Workers 初步資料：55 組參考設定中最大的 Hindi TN 模型約 46.2 MB，其中單一 FST 約 32.5 MB；現有 WASM 初始記憶體為 64 MiB。Workers 官方上限為每 isolate 128 MB，靜態單檔 25 MiB；需實測載入與記憶體，不能因中文通過就推定其他模型通過。當前 Workers 範例仍只有中文 smoke test，尚未擴大，沒有執行中的本機伺服器。

### Workers 全語言驗證進度

- `examples/cloudflare/` 已加入完整基準資料的分批重播。模型以 gzip 靜態資產載入，使用 ASSETS binding，沒有新增付費儲存資源。每批最多 128 筆、CPU 上限 30,000 ms。
- 已部署版本 `20c307b0-3411-4b1b-95e0-acbbbc16d17c`，部署紀錄 `.tools/cf-full-deploy.log`。
- 本機與雲端的 55 組模型載入／單筆轉換均通過，包括 Hindi TN 最大模型。證據 `.test-data/qa-cf-models-local.json`、`.test-data/qa-cf-models-remote.json`。這是模型檢查，尚不是完整案例通過證明。
- 本機已通過原有 48,505 筆完整基準，共 406 批、55 組設定，0 差異，耗時 407.78 秒。雲端完整重播仍在執行。查閱 `.test-data/qa-cf-parity-local.json`、`.test-data/qa-cf-parity-remote.json` 與同名 `.tools/cf-parity-*.log`。
- 雲端使用的執行程式雜湊保留於 `.test-data/qa-cf-runtime-sha256.txt`；新增完整覆蓋資料後仍須補測新增案例及任何修正後的版本。
- npm registry 對 `wetext-wasm` 的唯讀查詢回傳 404，目前沒有可查得的公開套件。尚未檢查發布帳號，也未發布或預留名稱。
- 執行中本機作業：cf dev（session 63937）、雲端完整重播（session 12500）。本機完整重播（session 72922）已 exit 0。完成後只關閉本機伺服器，保留雲端 qa- Worker 與資料。

### 雲端完整重播的 CPU 限制

- 已重現俄文 TN 第 2 批及德文 TN 的失敗。Cloudflare 執行紀錄明確回傳 `exceededCpu`，CPU 為 30,000–32,500 ms；證據 `.test-data/qa-cf-telemetry-failures.json`。這些批次包含 `nbest: 100` 或 `nbest: 1000`，不能把每批 128 次呼叫視為一般短句負載。
- 保持模型、套件及 CPU 上限不變，將俄文第 2 批、德文第 0 批縮為前 16 筆，兩次均回傳 200、比對通過；證據 `.test-data/qa-cf-ru-small.json`、`.test-data/qa-cf-de-small.json`。這只驗證前 16 筆，尚未涵蓋失敗批次的剩餘資料。
- 下一步：待目前完整重播結束後，讓測試端點支援 `offset`，將失敗批次分段重播；不得跳過剩餘案例或把局部通過列為整批通過。新增完整覆蓋資料後，也要以同一方式重播新增案例。保留 30,000 ms CPU 上限。
- 完整上游測試的逐項對應仍由既有 `gpt-6-sol` medium 子工作負責；完成通知會接續此工作階段，不輪詢子工作。尚未完成全部驗證，不得標記 npm 發行準備完成，也不得發布。
- 第一次雲端完整重播已結束：55 組設定、406 批，48,046／48,505 筆通過。4 個超時批次合計 459 筆，沒有其他失敗；耗時 1,400.75 秒。原始結果保留在 `.test-data/qa-cf-parity-remote.json`。
- 測試端點已支援 `offset`，並驗證負數、小數、超範圍拒絕，以及最後一筆不重複前段案例；Worker 型別檢查通過。證據 `.test-data/qa-cf-offset-local.json`、`.tools/cf-offset-typecheck.log`，可重跑 `.test-data/qa-cf-offset-check.mjs`。
- 修正後測試 Worker 版本為 `69e52570-0f8f-455b-980e-87e57bec4ebe`，部署紀錄 `.tools/cf-offset-deploy.log`。只變更測試分段端點，6 份核心 JavaScript／WASM 的 SHA-256 與完整重播版本一致。
- `.test-data/qa-cf-retry.mjs` 依原失敗清單分段，每段先用 16 筆；仍遇到相同 CPU 限制時再對半拆分，最小為 1 筆。其他錯誤直接失敗，不省略案例。結果寫入 `.test-data/qa-cf-parity-recovered.json`，紀錄 `.tools/cf-parity-recovery.log`。俄文 128 筆已補測通過；德文 331 筆仍在重播（session 96828）。
- 正式的可重跑 Workers 測試流程仍需納入分段規則，並接上新增完整覆蓋資料；目前的補測腳本只是保留此次重播證據，不能取代最後的完整測試流程。

### 逐項覆蓋與雲端重播接續結果

- 原有 48,505 筆基準已全部通過雲端：首次通過 48,046 筆，加上分段補測 459 筆，沒有輸出差異。補測耗時 384.70 秒，途中有一段仍超出 CPU 上限，再對半拆分後通過；不能只把固定 16 筆視為所有批次的保證上限。證據 `.test-data/qa-cf-parity-recovered.json`。補測程序已正常結束（session 96828，exit 0）。
- 新的完整擷取已完成：原始 pytest 27,178／27,178 通過，50,818 次成功 Processor 呼叫、46 次預期例外、144 組模型。Node／WASM 重播 50,864／50,864 通過。證據 `.test-data/qa-full-reference/`、`.test-data/qa-full-coverage/`，重跑工具為 `scripts/full_reference_plugin.py`、`scripts/full_replay.mjs`。
- 逐項矩陣目前有 24,818 個案例完整具備 Processor 證據；另 2,360 個仍需補齊 graph、parser、alignment、混合斷言或確認 Python 建置工具的適用性。`unresolved.json` 保留確切 nodeid，不能把成功呼叫總數當成全部案例覆蓋。
- 剩餘工作已分成三個 `gpt-6-sol` medium 子工作：直接 FST 與規則混合斷言、核心 parser／alignment／控制流程、Python 工具及間接 helper 的適用性。各自只寫 `qa-graph-*`、`qa-core-*`、`qa-scope-*` 與對應新腳本；主代理最後合併矩陣，並接上 Workers 重播。
- 下一步：讓 Workers 工具重播新增的 50,864 筆具 nodeid 資料，將 CPU 超時的分段重試整合進正式測試程式；收到三份補充覆蓋後，合併並核對 27,178 個 ID，重播新增 graph/core 事件，再做最終封裝與發行準備。不發布 npm。
- 目前只保留本機 `cf dev`（session 63937）與三個子工作執行中；其餘本機／雲端重播已結束。核心執行檔未變更，最終 npm 封裝尚未重新產生。

### 完整資料與剩餘斷言的整合進度

- 三個補充工作均已結束。`qa-scope-coverage/coverage.json` 有 1,007 筆（742 JS、265 Python 工具）；`qa-core-coverage/coverage.json` 有 506 筆（482 JS、22 Python 私有實作／工具、2 未解）；`qa-graph-coverage/coverage.json` 有 786 筆（722 JS、64 未解）。三者沒有重複 nodeid，但還漏了 61 個原待處理 nodeid，因此合併後仍有 127 個缺口，不能直接宣布完成。
- 61 個遺漏集中在各語言 normalizer 的 raw field/parser 檢查、中文與英文權重、中文 PostProcessor。64 個 graph 未解主要是 Python 模組、fixture、規則建構屬性與 token order；德文 `test_order_and_empty_api` 另有已通過完整重播的空字串與無效 nbest 行為。核心 2 項是 `test_weighted_field_restores_original_joint_path_costs`、`test_weighted_stream_projects_unique_outputs_before_expanding`。
- 另發現原本列為 `js-processor-pass` 的一些 `test_raw_tags_and_exact_mapping` 只比對 Processor 回傳值，沒有直接比對 JS parser。新的補充擷取會包含所有測試中直接呼叫 parser 的案例，避免只處理原未完成清單而漏掉此類斷言。
- `examples/cloudflare/prepare-parity.mjs` 已改讀 `qa-full-reference/events.jsonl`，產生保留 nodeid 與 caseId 的 50,864 筆資料、144 模型、499 個資料檔批次；新資產放在 `.qa-assets/qa-full-parity/`，原 `.qa-assets/qa-parity/` 保留。資料 SHA-256 為 `9e4b72dfc311b15ba6fbe083f22ab62b6c40c470177eb7145cdd706901d9f7bc`。
- Worker 端重用 `scripts/compare_event.mjs` 比對成功結果與預期例外，新增 `scripts/compare_event.d.mts` 型別。`test-parity.mjs` 逐次核對實際 caseId，檢查不漏跑、不重複；大量候選先分成 16 筆，只有 HTTP 503／1102 再對半拆分到最少 1 筆，其他錯誤直接保留為失敗。
- 新測試 Worker 版本 `787b623f-f888-4c38-a7e0-da13b5a77cb7`。144 模型本機檢查通過；本機完整重播 50,864／50,864 通過、46 預期例外、691 段、0 失敗，耗時 528.39 秒。證據 `.test-data/qa-cf-full-models-local.json`、`.test-data/qa-cf-full-parity-local.json`、`.tools/cf-full-reference-deploy.log`。核心 6 份 JavaScript／WASM 雜湊仍未變。
- 雲端同批 50,864 筆仍在重播（session 31974），結果寫入 `.test-data/qa-cf-full-parity-remote.json`，進度 `.tools/cf-full-parity-remote.log`。本機完整重播 session 72108 已 exit 0。
- 新增 `scripts/completion_reference_plugin.py`：從原始測試擷取直接 parser.parse／reorder、私有候選權重、2,048 重複路徑的去重上限、英文 IP 權重與中文 PostProcessor 原圖。輸出 `.test-data/qa-completion-reference/`。先行 3 個核心案例已通過；全選定案例擷取正在執行（session 55814，`.tools/completion-capture.log`）。此時該目錄 `summary.json` 仍可能是先行的 3 案例結果，須等程序結束再採信。
- 新增 `scripts/completion_runtime.mjs`，已實作 parser 錯誤、重排、私有候選的 tagger/joint 權重，以及重複路徑的實際 JS stream.limit 檢查；尚待建立 Node 重播入口與 coverage.json。它重用 `graph_runtime.mjs`，後者已新增完整 weighted paths 比對，原 1,953 筆圖重播仍全部通過（`.tools/graph-runtime-replay.log`）。
- `scripts/core_runtime.mjs` 現在直接檢查 WASM trace 後的 input/output spans 與無路徑錯誤，並透過 nativeCall 釋放原生例外；`core_replay.mjs` 已移除重複的 span 檢查，以便 Workers 執行同一套斷言。更精確的錯誤訊息比對曾不符實際 JS 文案，已修正為 `input spans must not be empty`；重新驗證中（session 32141，`.tools/core-runtime-replay.log`）。

接續順序：

1. 確認 session 55814 與 31974 的最終結果，不因暫時缺少輸出就重啟。完成補充擷取後，建立 `scripts/completion_replay.mjs`，用現有 `createNormalizer` 載入其模型，使用 WASM 載入其原圖，呼叫 completion runtime helper，核對全部事件與負向控制。
2. 對 64 個結構案例與 2 個 PostProcessor compactness 案例逐函式寫明 Python 建置／fixture 的理由；有空輸入／nbest 等執行行為的案例須同時引用完整 Processor 證據。不能把 runtime 行為歸成 Python-only。
3. 合併 scope/core/graph/completion 的結果，補完原 127 個缺口與已通過案例中的額外 parser 斷言；修改 `scripts/full_matrix.mjs`，要求全部 27,178 ID 都有證據且沒有 unresolved。核對 graph 工作「其他斷言須另核對」的限定，不因有一筆圖事件就視為整個案例完整。
4. Workers 尚未重播新的 1,953 graph 事件、core parser/alignment 事件與 completion 事件。新增獨立補充測試端點或批次，保留執行中 Processor 部署／資料的完整性，完成後才更新部署與重播額外事件。
5. 全部通過後才更新正式 npm scripts、README、最終矩陣與發行紀錄，重做 npm pack、離線安裝、型別／JS 測試及獨立 QA。目前 package.json 的 test:reference／test:parity 仍指向舊工具，需要接到完整流程。最終封裝尚未重建；絕不 npm publish。

目前仍在 main，沒有 commit／PR，也沒有切分支。只有主代理更新本紀錄。所有其他專案的既有變更保留；本機 cf dev session 63937 仍開著，全部驗證結束才關閉。沒有執行中的子代理。

### 最終覆蓋、Workers 與發行檢查

- 最終矩陣包含全部 27,178 個 nodeid：26,817 個純執行案例、23 個執行與 Python 建置混合案例，以及 338 個保留在 Python 的工具、fixture 或私有實作案例。未解為 0。見 `.test-data/qa-full-coverage/README.md`、`matrix.json`、`matrix-summary.json` 與空的 `unresolved.json`。
- `npm run check` 已通過：型別檢查、23 個 JavaScript／套件測試、50,864 筆 Processor 重播及全部補充斷言，0 失敗。證據 `.tools/final-check.log`。後續補上 wire escape 的可重播 parser fixture，核心重播與矩陣再次通過。
- `test:reference`／`test:parity` 已改為 `scripts/verify.mjs` 的完整流程，包含所有 nodeid、預期例外、直接 FST、parser、alignment、權重、Python 適用範圍及零未解檢查。
- 最新完整雲端重播：144 組模型、50,864／50,864 筆、46 個預期例外、0 失敗；耗時 1,927.81 秒，1 次 CPU 超時分段，全部原案例保留。證據 `.test-data/qa-cf-full-parity-remote.json`。這次核心 6 份 JavaScript／WASM 的 SHA-256 與前次版本一致。
- 額外資料為 1,953 筆 graph、24 筆核心 parser／alignment、1,164 筆 completion，合計 3,141 筆、328 批。本機全數通過。準備工具另核對全部 26,840 個 runtime nodeid；`test_mapping_exposes_token_type` 的資料形狀由實際 math mapping 呼叫提供證據，明列於 index 的 `aliases`，不虛增執行筆數。
- 補充 Worker 版本 `92d4d82c-a021-4b43-a7c3-fb19b0c566c0`，部署紀錄 `.tools/cf-extra-deploy.log`。雲端補充重播與主要 API 檢查正在執行（session 84722），輸出 `.test-data/qa-cf-extra-remote.json`、`qa-cf-final-smoke.json`。其中一次部署在新資料尚未完成準備時中止；最後的成功部署使用完整 3,141 筆資料，執行前已核對本機結果。
- 最終封裝已從通過安裝測試的原檔複製至交付位置，21,508,688 bytes，解開為 195,454,087 bytes；40 組模型，沒有執行階段 npm 依賴。ES modules、CommonJS 動態匯入與 TypeScript 均通過。證據 `.tools/final-package.log`、`.test-data/qa-package-summary.json`；SHA-256 已更新並檢查通過。
- `npm publish --dry-run --offline --ignore-scripts` 通過，與最終封裝的 SHA-512 一致。證據 `.test-data/qa-npm-publish-dry-run.json`。唯讀 `npm whoami` 回傳 E401；現有 npm 驗證無法使用，明天發布前需重新登入。沒有執行實際發布。
- 全部本機重播已結束。尚保留 cf dev（session 63937）供最後覆核；雲端補充檢查結束、獨立覆核完成後關閉本機伺服器。保留 qa- Worker 與測試資料。

### 明天的 npm 發布操作

本工作階段不執行以下登入或發布。套件名稱為 `wetext-wasm`、版本為 `0.1.0`；先前唯讀查詢未找到同名公開套件，名稱是否仍可使用由發布時的 registry 回應決定。

```sh
cd /Users/derek/PersonalSpace/wetext-wasm
shasum -a 256 -c wetext-wasm-0.1.0.tgz.sha256
npm login --registry https://registry.npmjs.org/
npm whoami --registry https://registry.npmjs.org/
npm publish ./wetext-wasm-0.1.0.tgz --access public
```

仍在原本的 main 分支，未 commit、未建立 PR。其他專案的既有變更保留。沒有修改 Stow package 文件，無需 Stow。

### 最後收尾

- 雲端補充 3,141／3,141 筆全部通過，328 批，0 失敗，耗時 207.89 秒；其後 10 次主要 API 請求也全部通過。session 84722 已 exit 0。所有事件 ID 與本機資料一致，沒有漏跑、重複或替換。
- 獨立覆核使用 `gpt-6-sol`、medium，確認矩陣、關鍵原測試、完整／補充 Workers 資料、caseId、雜湊及最終封裝，未發現阻擋發行準備的問題。它沒有重跑耗時測試，也沒有逐一複查全部 338 個 Python 專屬案例；報告明列範圍。見 `.test-data/qa-final-review/README.md`。
- 最終交付檔 SHA-256 再次檢查通過；與 npm 離線安裝及 dry-run 記錄的大小、SHA-512 一致。
- 本機 cf dev 已關閉。沒有剩餘測試、部署或子代理作業；雲端 qa- Worker 與測試資料依要求保留。沒有新增排程、資料庫或儲存服務。
- 未完成的使用者操作只有明天自行登入與發布 npm；它不屬於本次執行範圍。未測正式流量負載、Workers Free 方案或另一台機器的完整工具鏈安裝。Cloudflare 相容修正後未另跑瀏覽器 QA；初版瀏覽器與 module Web Worker 檢查已通過。
- 收到早期 `qa-cf-parity-remote.json` 的 exit 1 通知後，再次核對：原 4 個失敗批次的 459 筆已全部補測通過；後續 50,864 筆完整重播與 3,141 筆補充重播均為 0 失敗，6 份核心檔雜湊仍一致。完成狀態不變，本次未重跑測試。

### 移至 PersonalSpace 與 GitHub 發布（2026-11-04）

- 依使用者指定，將完整專案從 `/Users/derek/dotfiles/wetext-wasm` 移至 `/Users/derek/PersonalSpace/wetext-wasm`。同一磁碟上的目錄重新命名保留了全部檔案；搬移前後目錄 inode 相同。
- 已從 dotfiles 的 `DEPENDENCIES.md` 移除本套件項目。獨立專案的建置需求仍列於 `README.md` 和 `sources.json`；dotfiles 其他變更保留。
- 已在新目錄初始化獨立的 `main` 分支，沒有切換 dotfiles 分支。已建立個人私有倉庫 `https://github.com/1orZero/wetext-wasm`，並設定 `origin`；GitHub 回應確認 owner 為 `1orZero`、visibility 為 `PRIVATE`。
- 原始碼、測試、fixtures、授權、範例與本紀錄納入 Git。工具鏈、上游來源、模型、建置產物、完整測試資料與 npm 封裝依既有 `.gitignore` 保留於本機。
- 舊 CMake 建置目錄保留在 `.tools/build-before-personalspace/`，新位置重建成功，紀錄為 `.tools/relocation-build.log`。Python／Pynini 載入通過；沒有符號連結指向舊專案路徑。
- 重建後 JavaScript 檔案雜湊相同，WASM 雜湊不同；新的執行檔已通過 `npm run check`，exit 0，完整輸出為 `.tools/relocation-check.log`。原交付封裝保留不變，SHA-256 檢查通過。
- 發布前檢查已確認 111 份待提交檔案共約 2.12 MB，未包含工具鏈、模型或憑證檔；常見權杖與私鑰標記掃描無命中。第三方授權檔保留原始格式；只移除自有 `scripts/inventory.py` 結尾的多餘空行。
- 原始碼已 commit／push，初始提交為 `77ff229d7a8aa39cbde759784a9070081873766f`。GitHub 與本機的 `main` 提交已核對一致；遠端預設分支為 `main`、可見性為 `PRIVATE`。本次未發布 npm，也未重跑或變更雲端部署。
- 搬移後的 23 項套件／API 測試與型別檢查已通過，含離線安裝、ES modules、CommonJS 動態匯入與 TypeScript；新的測試封裝資料見 `.test-data/qa-package-summary.json`，它與上方保留的原交付封裝分開記錄。
- 完整 Node.js 重播再次通過 50,864 筆，144 組模型、46 個預期例外，0 差異；補充 FST、parser、alignment 與權重斷言也全部通過。最終矩陣仍完整對應 27,178 個案例，未解為 0。Python 的 27,178 筆原始結果沿用先前成功的擷取資料，本次沒有重新執行完整上游 pytest。
- 搬移及私有原始碼發布已完成；沒有剩餘測試、部署或子代理作業。dotfiles 的其他變更保留。npm 發布仍需先處理原先的 E401 登入問題，不在本次 GitHub 發布範圍。

### README 致謝與授權核對（2026-11-04）

- README 開頭已明確說明本套件由 Python 的 WeTextProcessing 移植，原始套件、演算法、語言規則與資料的成果歸屬原作者、貢獻者及其致謝的專案，並附原 repository 連結。
- 本專案 `LICENSE` 與固定上游版本 `c3b4d88d11c5efef817881f7e515cbdd3a19d99b` 的 `LICENSE` 逐位元相同；`package.json` 保持 `Apache-2.0`，未改動原授權條款。
- 已在四份 TypeScript 移植檔及 C++ graph binding 補齊相關原作者版權、原 Apache 授權標頭、移植說明與來源連結。保留 Zhendong Peng 與 WENET COMMUNITY 的原始聲明。逐檔核對只變更註解與空行，沒有變更執行邏輯。
- 新增 `licenses/wetext.txt`，保留上游 tn／itn 原始碼的 29 種版權聲明，以及 README 的完整致謝段落。`THIRD_PARTY_NOTICES.md` 已連結此檔；其他第三方授權及姓名資料的原始條款保留。
- README 已加入 npm 登入、確認帳號、重新封裝、發布預演、正式發布及版本驗證步驟，明確說明 `wetext-wasm` 為公開 npm 套件，與私人 GitHub repository 的可見性分開。使用者會先在這台 Mac 完成瀏覽器登入，再交由 Agent 處理正式發布；本次沒有執行登入或正式發布。
- 驗證通過：`npm run build`、`npm run typecheck`、既有套件離線安裝測試（ES modules、CommonJS 動態匯入、TypeScript），以及實際封裝檔內 README、LICENSE、全部第三方聲明與已編譯 JavaScript 授權標頭的內容核對。WASM 的 SHA-256 與此次修改前完全一致，未重跑完整行為比對或雲端測試。
- 最新封裝與校驗檔已更新；舊檔保留於 `.test-data/qa-before-attribution/`。新封裝的離線發布預演通過，與已測封裝的 SHA-512 一致。證據為 `.test-data/qa-attribution-package.json`、`.test-data/qa-attribution-npm-dry-run.json` 及 `.tools/attribution-*.log`。
- 本次核對公開授權文字與發行內容，沒有進行法律審查，也未獨立調查上游每項素材的完整權利來源。待使用者完成 npm 登入後，先確認帳號、名稱可用性及發布驗證要求，再發布最新版封裝。沒有執行中的測試或部署。

### 公開 GitHub 與 npm 首次發布（2026-11-04）

- 使用者已完成 npm 登入，`npm whoami` 確認為 `1orzero`。名稱查詢回傳 E404；正式發布前尚無可查得的 `wetext-wasm` 套件。
- 依使用者新指示，GitHub `1orZero/wetext-wasm` 已改為 PUBLIC，已讀回確認。
- README 已改用 `npm install wetext-wasm`，package metadata 已加入公開 GitHub repository。提交 `824b286` 已推送 main。
- 正式封裝再次通過既有離線安裝測試，檔案為 `wetext-wasm-0.1.0.tgz`，21,511,458 bytes；SHA-256 為 `700c96f848f9edd5a9965ddcfd408cbd7a41a011be16a6ba5fe39298df842f2a`。證據 `.test-data/qa-npm-release-package.json`、`.tools/npm-release-package.log`。前版封裝保留在 `.test-data/qa-before-npm-release/`。
- 非互動式發布曾回傳 EOTP；改用互動式發布並完成 npm 官方驗證後，程序回傳 `+ wetext-wasm@0.1.0`。公開 registry 已確認版本 `0.1.0`、`latest` 標籤、維護者 `1orzero` 與 `Apache-2.0` 授權。
- 已從公開 registry 下載封裝，SHA-256、SHA-512 與檔案大小均與已驗證的本機封裝一致。從全新目錄以 `npm install wetext-wasm@0.1.0` 安裝成功，使用獨立 npm 快取與空白使用者設定，核對 40 組模型及 lockfile 完整性。
- 發布後驗證通過：中文 ITN、百分比、多候選、tag／verbalize、emoji 的 code-point 位置與英文 TN；ES modules、CommonJS 動態匯入與 TypeScript 嚴格型別編譯均通過。證據為 `.test-data/qa-npm-published.json`，測試目錄保留於 `/private/tmp/qa-wetext-npm-xfaQWl/`。
- 公開連結：[GitHub](https://github.com/1orZero/wetext-wasm)、[npm 0.1.0](https://www.npmjs.com/package/wetext-wasm/v/0.1.0)。
- 本次沒有變更執行邏輯，未重跑完整上游 pytest 或 Workers 全案例；沿用既有完整結果，另外確認此次發布內容與已測封裝一致。所有發布與安裝程序均已結束，沒有待執行工作。

### 已發布套件的雲端重測與清理（2026-11-04）

- 使用者要求在雲端測試，完成後刪除本工作階段建立的 Cloudflare Workers；此明確指示取代先前保留雲端測試資源的規則。本機測試證據仍保留。
- 已核對先前部署紀錄，本專案只建立 `qa-wetext-wasm`；不刪除帳號內其他專案或原有 Worker。測試前清單存於 `.test-data/qa-cf-npm-workers-before.json`。
- 將依使用者 QA 規則委派 `gpt-6-sol`、medium，使用 npm 的 `wetext-wasm@0.1.0` 與既有完整 corpus，在同一個測試 Worker 重跑 50,864 筆 Processor、3,141 筆補充斷言及主要 API 檢查；沿用 30,000 ms CPU 上限與既有超時分段。
- 主工作階段負責測試完成後的 Worker 刪除、清單核對與本紀錄更新。子工作只執行 QA 並保存證據，不切換分支、不發布 npm、不建立新的付費資源。

### 中文聽寫獨立模型（2026-11-04）

- 已將使用者表格及兩份實測腳本中的 59 個中英文輸入，逐項交給固定 Python 上游與 npm `0.1.0` 執行，輸出全部相同。這些問題來自上游文法，沒有發現 JavaScript 移植差異；比對證據為 `.test-data/qa-zh-dictation/npm-parity.json`。
- 新增 `scripts/zh_dictation.py`，重用上游規則編譯獨立的 `models/zh-itn-dictation/`。以 `npm run models -- --profile zh-dictation` 建置，再透過既有 `createNormalizer({ model })` 載入。未變更 TypeScript／WASM 執行邏輯或預設模型。
- 新模型支援繁體數字字形、廿／卅、連續數字不插空格、保留中文測量單位與年月日／號格式；例如 `三萬五千` → `35000`、`兩萬三` → `23000`、`零三四八五四六` → `0348546`、`三十秒` → `30秒`、`二零二六年十一月四號` → `2026年11月4號`。原始欄位、其他文字字形及已有空格保留，`三三兩兩` 列入保留詞。
- 保留上游限制：`一億兩千萬` → `1億2000萬`，不展開成單一整數；`M 一` 不合併成代號；`十分重要`、`七七八八`、`數一二三` 的上下文判斷仍由呼叫端處理。英文與範圍寫法不變。上游也保留 `两三个`，因此對應的 `兩三個` 維持原文。
- 使用者提供的每個輸入都有預設輸出測試；52 個中文輸入另驗證新模型的 normalize 與 tag／verbalize。加上單位、日期、字形、原始空格、code-point mapping 與候選輸出，專項測試共 131 項，全數通過。完整套件測試 154／154 與型別檢查通過，含從離線封裝載入新模型及 TypeScript 使用方式。
- 40 個預設模型的 120 個檔案，逐位元比對 npm `0.1.0` 全部一致。新封裝包含 41 組模型，僅用於本機安裝驗證；既有正式發布封裝保留，尚未發布新版 npm，也未修改 voiceink-hant。
- README 已說明模型選擇、來源建置方式及限制。新增內容依 `humanizer` 潤飾；本紀錄依 `tw-writing` 與 `humanizer-zh-tw` 核對。
- `npm run check` 已完成（session 55088，exit 0）：154 項測試、50,864 筆 Processor 重播、1,953 筆直接圖重播、核心 parser／mapping 斷言與 1,164 筆補充斷言均通過；最後矩陣完整對應 27,178 個上游案例，未解為 0。紀錄為 `.test-data/qa-zh-dictation/check.log`。本次重播既有 Python 證據，沒有重新執行全部上游 pytest。
- 新模型的程式修改、文件與本機驗證已完成；新模型尚未做雲端驗證，也未 commit／push／發布 npm。正式發布的 `0.1.0` 保持原樣。主工作階段沒有剩餘本機執行作業。
- npm `0.1.0` 的完整雲端 QA 與測試 Worker 清理均已完成，結果如下。新模型的本機變更仍保留，沒有新增發布或修改 voiceink-hant。


### npm 雲端驗證與測試 Worker 清理完成（2026-11-04）

- `gpt-6-sol`、medium 子工作已完成，部署版本為 `406a2246-8b47-474b-9d2d-e213b5624bb1`。公開 registry 套件與部署來源的 24 份執行檔及相關檔案逐位元一致；其他測試設定使用既有上游模型快照。
- 雲端 144 組模型／設定、50,864／50,864 筆 Processor 事件全數通過，含 46 個預期例外；case ID 無遺漏或重複。1 個 CPU 超時批次依既有規則拆分後通過，未提高 CPU 上限。另有 3,141／3,141 筆補充斷言及 10／10 次主要 API 請求通過。完整證據保留於 `.test-data/qa-cf-npm-release/`。
- 主工作階段於 2026-11-04 09:47（台灣時間）執行 `cf workers delete qa-wetext-wasm --force`，exit 0；沒有使用 `--delete-with-references`。刪除前後即時清單確認目標已移除，帳號 Worker 數量從 11 個減為 10 個，其餘 10 個名稱與 ID 全部相同。證據為 `.test-data/qa-cf-worker-cleanup.json`、`qa-cf-npm-workers-pre-delete.json` 與 `qa-cf-npm-workers-after.json`。
- 本專案建立的測試 Worker 已全部清除；本機測試證據保留。沒有剩餘測試、部署、子工作或待清理資源。
- 本次雲端測試範圍是已發布的 npm `0.1.0`，未包含新增 `zh-itn-dictation` 模型，也未重跑 Python 專屬測試。新模型已完成本機驗證，尚未 commit／push／發布 npm。

### 獨立模型必要性的第二意見（2026-11-04）

- 使用者要求詢問 Opus 5.5，以 Extra high reasoning effort 重新評估是否需要新增可選模型，或應沿用既有模型。
- 已透過 T3 委派 Claude Opus 5.5，回傳設定確認 `claude-opus-5-5`、`effort: xhigh`。這是唯讀決策評估；子工作會查閱既有模型選項、目前編譯實作、測試證據及必要的 voiceink-hant 呼叫端，提出方案優缺點與明確建議。沒有授權修改、提交或發布。
- Opus 第二意見已完成，主工作階段已核對呼叫路徑、上游選項與暫存實驗。這輪只提供決策建議，沒有撤回、修改或發布程式。
- 子工作：<t3-thread://v2/27cb8ad0-cb91-4ff0-899d-713e6da227f9/thread:delegated-task:command%3Amcp%3A03ddd5de-5190-4c51-ac6f-db4c8890a428%3Adelegate-task%3Awetext-opus55-xhigh-model-necessity-20261104>


### 第二意見覆核結果（2026-11-04）

- Opus 建議目前不要把 zh-itn-dictation 作為公開、隨 npm 攜帶的模型。主工作階段確認 voiceink-hant 的 numberCandidates 只把 NUMBER_RUN 擷取的純數字片段交給 chineseNumber，再由 Jev 判斷是否採用；單位、日期字與空格不在該片段內。NUMBER_RUN 另有大寫字母後的單一數字分支，不能簡化成所有片段都至少兩字。
- 主工作階段重新執行 /private/tmp/wetext-review/slot.mjs 與 zero.mjs。27 個片段中，既有 zh-itn 加字形／廿卅預處理並去除模型插入的空格，和新模型經純數字檢查後的結果一致；部分結果是兩者都拒收，不能解讀成 27 個都可正確轉換。大數值、單一數字與兩字數字串仍需既有處理作為後備。
- 整句日期、時間需求不能因此視為完成：既有四個 ITN 選項不控制中文日期、單位格式；原本的片段路徑也抓不到三點半，且不會單獨轉換十一月三號中的三。若保留這些需求，就必須另處理候選擷取與文法格式，不能只換回舊模型。
- 核對後的建議：以目前片段流程為前提，不需要新增公開模型，先不將獨立文法列為 npm 發行內容；若確定要完整日期／時間與中文格式，再評估獨立文法及整句位置對應流程。這是條件式建議，沒有把先前完整需求刪除，也沒有授權實作回退。
- 額外缺口：兩個模型都保留二〇二四，既有 chineseNumber 可處理〇。Opus 的 27 例腳本尚未包含〇預處理或真正呼叫既有函式的後備分支；報告裡那段含〇與後備的程式是建議，並非完整驗證的接法。
- Opus 對測試來源的概括需限縮：131 項專項測試含 59 項獨立 Python 上游輸出，不能說全部預期值都由本專案自行制定；新模型特有的輸出契約仍由本專案維護。未以真實聽寫紀錄評估替代方案，也未量測其 Worker 效能。
- 第二意見與覆核均已完成，沒有執行中的子工作。現有程式與模型保持原狀，沒有新發布或雲端資源。

### 既有模型選項的釐清（2026-11-04）

- 使用者追問是否應修改既有模型選項。已核對現有四個 ITN 選項，均未提供繁體輸入、連續數字空格或中文日期／單位格式設定；只更改現有選項值無法完成原需求。
- 若保留完整需求，可以在既有 zh-itn 建置流程擴充選項並保留原預設值，但仍須實作額外文法，且不同設定會編出不同的 FST 檔案。改成選項介面本身不會消除自訂規則的維護成本。
- Opus 的較小方案是既有模型加純數字片段的前後處理，適用範圍不包含完整日期／時間及中文格式。這輪僅釐清設計，現有程式變更與模型全部保留，未修改、提交或發布程式；沒有執行中作業。

### 中文聽寫編譯選項與 npm 0.2.0（進行中，2026-11-04）

- 使用者已確認改用既有 zh-itn 編譯選項，並要求完成後發布 npm，再通知 thread 160f2188-27d7-4eae-8096-eadf1c75cc3b。已讀取該 thread，後續只通知發布結果，不修改 voiceink-hant。
- 已移除 --profile 與公開 zh-itn-dictation 模型入口，改由 --options 的 dictation:true 啟用，預設 false。自訂產物必須指定 bundled models/ 以外的輸出路徑。原本四個上游選項可以一起使用，另補上 〇 字形。
- 舊的實驗模型保留於 .test-data/qa-zh-options/previous-model/。npm 仍只攜帶 40 組上游預設模型，新增封裝 setup、Python launcher、exporter 與中文編譯實作四份工具檔，版本更新為 0.2.0，尚未發布。
- 已通過 157 項測試、型別檢查及離線封裝安裝。40 組模型的 120 個檔案與 21 個執行檔均和已發布 0.1.0 逐位元相同；dictation:false 重新編譯的三個檔案也與原本 zh-itn 完全相同。證據位於 .test-data/qa-zh-options/。
- 已在安裝後的套件實測 npm --prefix 指令，確認可編譯自訂設定。README 採用此指令，避免 npm explore 的第二層 shell 移除 JSON 引號。
- npm run check 已完成（exec session 85725，exit 0），紀錄為 .test-data/qa-zh-options/check.log。157 項測試、50,864 筆 Processor 重播、1,953 筆 graph 重播與 1,164 筆補充事件均通過；最終矩陣完整對應 27,178 個上游案例，未解為 0。本次沿用既有 Python 證據，未重跑完整上游 pytest。
- 已調整安裝工具的完成提示，避免 npm 安裝者收到只適用來源 checkout 的 build 指令；封裝測試改用 README 相同的 npm --prefix 入口。其餘最後修改只有文件與 import 空行，接著重驗發行封裝，再提交原始碼、發布 npm、公開安裝驗證及通知指定 thread。

- 最終封裝測試已通過（exec session 17888，exit 0），以 README 相同的 npm --prefix 指令從離線安裝後的套件編譯並載入自訂模型，ES modules、CommonJS 動態匯入與 TypeScript 均通過。最終封裝直接複製自已測試檔案，SHA-256：4c55d1bc01b5bfcf87bf4154a11a943f350ac2d8e84b55747624bcd162e013de；證據為 .test-data/qa-zh-options/release-package.json 與 package-final.log。
- 沒有剩餘本機測試程序。接續原始碼提交與 npm 發布；新編譯選項尚未進行雲端驗證，預設模型與已發布版本一致。
