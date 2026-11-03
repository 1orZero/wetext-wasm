"""Account for assertions that stay in the pinned Python build/test toolchain."""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / '.test-data'


def read(path):
    return json.loads((DATA / path).read_text())


rows = read('qa-full-coverage/processor-unresolved.json')
supplements = {row['nodeid']: row for lane in ('scope', 'core', 'graph', 'completion')
               for row in read(f'qa-{lane}-coverage/coverage.json') if row['status'] != 'unresolved'}
reasons = {}
for name in ('test_native_date_class_exists', 'test_rule_modules_exist', 'test_native_pipeline_exists',
             'test_native_time_exists', 'test_rule_module_exists', 'test_native_rule_exists'):
    reasons[name] = '只斷言 Python 模組可匯入及規則類別存在；規則仍由 Python 建置，npm 不提供 Python 模組。'
for name in ('test_original_fixture_count', 'test_source_fixture_counts', 'test_fixture_spaces_are_retained',
             'test_original_fixture_counts', 'test_source_fixture_empty_and_leading_space_are_retained',
             'test_original_fixture_count_and_trailing_spaces'):
    reasons[name] = '只斷言原始 fixture 的筆數、順序或空白；完整原 pytest 保留並通過這些資料完整性檢查。'
for name in ('test_order_contract', 'test_own_token_orders', 'test_no_default_field_reordering',
             'test_explicit_empty_token_orders', 'test_token_order_is_reading_order',
             'test_token_order_reads_denominator_first', 'test_order_and_empty_api'):
    reasons[name] = 'TOKEN_ORDER 常數、規則物件的 token_orders／ordertype 屬 Python 文法建置設定；原 pytest 核對設定，匯出的設定供 JS parser 使用。案例含執行呼叫時另要求 Processor 重播證據。'
reasons['test_processor_stays_compact'] = '只斷言 Python 建置的 PostProcessor 圖少於 20,000 個狀態；JS 使用同一預編譯 FST，不重新建圖。'
reasons['test_exposes_bare_semantic_graphs'] = '只斷言 Python 文法建構物件的 sign 與子圖存在且狀態數大於零；npm 不公開 Pynini 文法建構物件。'
reasons['test_shared_byte_graphs_are_not_modified'] = '只斷言 Python 建構規則前後的共用 byte 圖等價；npm 執行階段不建構或修改 Python 共用圖。'

mixed = {
    'itn/german/test/calendar_test.py::test_order_contract': 'Python token schema 常數與物件屬性由原 pytest 核對；verbalize 的結果另由 Processor 重播驗證。',
    'itn/german/test/numeric_test.py::test_shared_digit_graph_is_unchanged': '共用 byte.DIGIT 的全圖等價是 Python 建圖不變條件；對 12 的拒絕另由 WASM 原圖重播。',
    'tn/german/test/calendar_test.py::test_shared_digit_is_not_mutated': '共用 byte.DIGIT 的全圖等價是 Python 建圖不變條件；對 12 的拒絕另由 WASM 原圖重播。',
    'tn/german/test/financial_test.py::test_schema_and_shared_byte_graphs': 'Python 共用圖等價與 schema 常數由原 pytest 驗證；空輸入與圖接受條件另由 Processor／WASM 重播。',
    'tn/german/test/numeric_test.py::test_shared_digit_graph_is_unchanged': 'Python 共用圖等價由原 pytest 驗證；對 12 的拒絕另由 WASM 原圖重播。',
    'tn/korean/test/money_test.py::test_prefix_currency_is_read_after_amount': 'Python TOKEN_ORDER 常數由原 pytest 驗證；重排及轉換輸出另由 JS parser／Processor 重播。',
    'tn/korean/test/time_test.py::test_postfix_order': 'Python TOKEN_ORDER 常數由原 pytest 驗證；解析及重排的完整欄位順序另由 JS parser 重播。',
}
sources = {}
coverage = []
for row in rows:
    nodeid = row['nodeid']
    file = nodeid.split('::')[0]
    name = nodeid.split('::')[-1].split('[')[0]
    function = f'{file}::{name}'
    if function not in mixed and nodeid in supplements:
        continue
    reason = mixed.get(function) or reasons.get(name)
    if reason is None:
        continue
    assert row['python'] == {'setup': 'passed', 'call': 'passed', 'teardown': 'passed'}, nodeid
    assert not row['failures'] and row['calls'] == row['replayed'], nodeid
    if name == 'test_order_and_empty_api':
        assert row['calls'] >= 9, 'Empty-input and invalid-nbest behavior must also run in JS'
    if file not in sources:
        text = (ROOT / 'vendor/WeTextProcessing' / file).read_text()
        sources[file] = (text, {n.name: n for n in ast.walk(ast.parse(text)) if isinstance(n, ast.FunctionDef)})
    text, functions = sources[file]
    node = functions[name]
    assertions = [ast.get_source_segment(text, n) for n in ast.walk(node) if isinstance(n, ast.Assert)]
    coverage.append({'nodeid': nodeid, 'status': 'python-build-pass', 'assertions': assertions,
                     'rationale': reason, 'evidence': [f'vendor/WeTextProcessing/{file}:{node.lineno}',
                     'qa-full-reference/events.jsonl', 'qa-full-coverage/processor-results.json']})
out = DATA / 'qa-retained-coverage'
out.mkdir(exist_ok=True)
(out / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')
print({'retained_assertion_cases': len(coverage)})
