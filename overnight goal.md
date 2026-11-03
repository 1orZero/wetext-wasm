# WeTextProcessing TypeScript＋WASM 完成紀錄

狀態：實作、完整測試覆蓋與 npm 發行準備完成；尚未發布 npm。日期：2026-11-04。

目前工作目錄：`/Users/derek/PersonalSpace/wetext-wasm`。GitHub 私有倉庫發布進度見文末。

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
| 發行封裝 | 離線安裝、ES modules、CommonJS 動態載入、TypeScript 與雜湊檢查通過 | `.tools/final-package.log`、`.test-data/qa-npm-publish-dry-run.json` |
| npm 發布預演 | 離線 dry-run 通過；登入檢查 E401，實際發布前需重新登入 | `.test-data/qa-npm-publish-dry-run.json`、`qa-npm-account.json` |
| 獨立覆核 | 未發現阻擋發行準備的問題；範圍為收據、關鍵程式與原測試抽查 | `.test-data/qa-final-review/README.md` |

以下保留實作決策與各階段紀錄。最終結果以本節為準。

## 交付檔案

- 套件：[`wetext-wasm-0.1.0.tgz`](wetext-wasm-0.1.0.tgz)，21,508,688 bytes，包含 40 組預設模型。
- 雜湊檔：[`wetext-wasm-0.1.0.tgz.sha256`](wetext-wasm-0.1.0.tgz.sha256)。
- 使用、建置與模型選項：[README.md](README.md)。
- 授權與第三方聲明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、`licenses/`。
- 原始碼：`src/`、`native/`；建置與比對工具：`scripts/`。

SHA-256：

```text
65d1aa3085f3af79c8bcc87effdc0d8a248d95a0883f8c12c9b295dc34145c0b
```

原交付檔案與發行準備時通過離線安裝的封裝檔逐位元相同；當時也已核對 npm 記錄的 SHA-512、檔案大小、40 份模型 manifest，以及已安裝的 `dist/` 與建置輸出。搬移後重建的驗證另記於文末，原交付檔案未替換。初版曾通過瀏覽器 QA；Cloudflare 相容修正後已重跑 Node.js 與 Cloudflare Workers 驗證，未重跑瀏覽器 QA。

安裝方式：

```sh
npm install /Users/derek/PersonalSpace/wetext-wasm/wetext-wasm-0.1.0.tgz
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
- 重建後 JavaScript 檔案雜湊相同，WASM 雜湊不同；新的執行檔正在跑 `npm run check`，輸出為 `.tools/relocation-check.log`。原交付封裝保留不變，SHA-256 檢查通過。
- 發布前檢查已確認 111 份待提交檔案共約 2.12 MB，未包含工具鏈、模型或憑證檔；常見權杖與私鑰標記掃描無命中。第三方授權檔保留原始格式；只移除自有 `scripts/inventory.py` 結尾的多餘空行。
- 待辦：確認搬移後完整測試結果、commit／push，核對遠端提交版本。本次不發布 npm，也不重跑或變更雲端部署。
- 搬移後的 23 項套件／API 測試與型別檢查已通過，含離線安裝、ES modules、CommonJS 動態匯入與 TypeScript；新的測試封裝資料見 `.test-data/qa-package-summary.json`，它與上方保留的原交付封裝分開記錄。
