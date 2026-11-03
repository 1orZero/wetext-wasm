"""Classify this QA lane's remaining upstream assertions and verify its receipts."""
import ast
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / '.test-data'
UPSTREAM = ROOT / 'vendor/WeTextProcessing'
OUT = DATA / 'qa-scope-coverage'


def read(name):
    return json.loads((DATA / name).read_text())


unresolved = read('qa-full-coverage/processor-unresolved.json')
collected = set(read('qa-full-reference/collected.json'))
results = {row['nodeid']: row for row in read('qa-full-coverage/processor-results.json')}
events = collections.defaultdict(list)
for line in (DATA / 'qa-full-reference/events.jsonl').open():
    event = json.loads(line)
    if event['kind'] == 'processor':
        events[event['nodeid']].append(event)

sibling_files = {
    'tn/chinese/test/processor_test.py',
    'tn/chinese/test/alignment_test.py',
    'tn/chinese/test/token_parser_test.py',
    'tn/test/robustness_test.py',
    'tn/test/punctuation_spacing_test.py',
    'tn/chinese/test/cardinal_test.py', 'tn/chinese/test/postprocessor_test.py',
}
# Raw graph and German rule assertions are owned by the other QA lane.
raw_names = ('raw_', 'source_', 'semantic_graph', 'bare_', 'graph', 'rule_', 'native_',
             'tag_keeps_written_fields', 'token_order', 'prefix_currency', 'minor_part',
             'postfix_order', 'known_ending', 'quoted_field', 'reordered_fields',
             'deterministic_modes', 'punctuation_spacing', 'escaped_word_fields')

def owned(nodeid):
    file, test = nodeid.split('::', 1)
    name = test.split('::')[-1].split('[', 1)[0]
    if file in sibling_files or '/german/' in file:
        return False
    if file in {'tn/chinese/test/cache_test.py', 'tn/chinese/test/cache_safety_test.py'} or name == 'test_source_case_count':
        return True
    return '/korean/test/' not in file and not any(part in name for part in raw_names)

sources = {}
def source(file, name):
    if file not in sources:
        tree = ast.parse((UPSTREAM / file).read_text())
        sources[file] = {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    node = sources[file].get(name)
    assert node, (file, name)
    return f'vendor/WeTextProcessing/{file}:{node.lineno}-{node.end_lineno}'


def classify(row):
    nodeid = row['nodeid']
    file, test = nodeid.split('::', 1)
    name = test.split('::')[-1].split('[', 1)[0]
    src = source(file, name)
    evidence = [src, '.test-data/qa-full-reference/pytest.log',
                '.test-data/qa-full-reference/events.jsonl']
    calls = events[nodeid]
    python = row['python']
    assert set(python.values()) == {'passed'}, nodeid
    assert nodeid in collected and nodeid in results, nodeid
    assert not row['failures'] and row['calls'] == row['replayed'] == len(calls), nodeid
    if calls:
        evidence += ['.test-data/qa-full-coverage/processor-results.json',
                     '.test-data/qa-full-coverage/replay.log']

    fixture = 'fixture_count' in name or name in {'test_source_case_count', 'test_reversed_fixture_count'}
    build = (file in {'tn/chinese/test/cache_test.py', 'tn/chinese/test/cache_safety_test.py',
                       'itn/test/utils_test.py', 'tn/test/cli_test.py'}
             or name.startswith('test_standalone_from_') or fixture)
    if build:
        if fixture:
            assertions = ['上游測試資料的案例數、順序與保留空白由原 pytest 斷言。']
            why = '這是 Python 測試資料完整性檢查；npm API 不提供案例清單或其筆數。'
        elif '/cache' in file:
            assertions = ['Python 文法編譯快取的鎖、檔案、權限、發布或組態斷言由原 pytest 驗證。']
            why = 'README 將 Python 磁碟快取列為建置工具；npm 執行階段從模型檔載入，沒有同一磁碟快取 API。'
        elif file == 'tn/test/cli_test.py':
            assertions = ['Python CLI 的解析、選項、輸入讀取、派送與輸出斷言由原 pytest 驗證。']
            why = 'README 明確將 Python 命令列工具列為建置工具；npm 套件提供 createNormalizer API，沒有對應 CLI。'
        elif file == 'itn/test/utils_test.py':
            assertions = ['Python 套件路徑解析與越界拒絕由原 pytest 驗證。']
            why = '這是 Python 套件內部路徑工具；npm 模型載入另由 JS 邊界測試驗證。'
        else:
            assertions = ['Python 語法套件不依賴相反方向套件的原始碼斷言由原 pytest 驗證。']
            why = '這是 Python 建置套件的模組獨立性；npm 發行物沒有 Python 模組匯入承諾。'
        return dict(nodeid=nodeid, status='python-build-pass', assertions=assertions,
                    rationale=why, evidence=evidence)

    mapping = name in {'test_original_mapping', 'test_original_cased_mapping'} and file == 'itn/hindi_english/test/normalizer_test.py'
    swedish = name in {'test_original_nondeterministic', 'test_original_multiple_candidates'} and file == 'tn/swedish/test/normalizer_test.py'
    if mapping and len(calls) == 1 and calls[0]['method'] == 'normalizeWithMapping':
        expected = calls[0]['expected']
        assert isinstance(expected, dict) and {'input', 'output', 'mappings'} <= expected.keys()
        assertions = ['normalize_with_mapping 的 output_text 等於獨立 fixture 預期值。',
                      '每筆 mapping 的輸入與輸出文字、code point 起訖位置完整等於 Python 結果；原 pytest 已驗證切片一致。']
        return dict(nodeid=nodeid, status='js-extra-pass', assertions=assertions,
                    rationale='原始 _check_mapping 的全部斷言由完整結果相等與已通過的 pytest 推出。', evidence=evidence)
    if swedish and calls and all(x['method'] == 'normalize' and isinstance(x['expected'], list) for x in calls):
        assertions = ['within_top_candidates 每輪 n-best 輸出及候選集合包含關係。']
        return dict(nodeid=nodeid, status='js-extra-pass', assertions=assertions,
                    rationale='同一輸入、模型和 n-best 的每輪完整候選陣列與 Python 相等；原 pytest 的集合包含斷言成立。', evidence=evidence)
    return dict(nodeid=nodeid, status='unresolved',
                assertions=['原測試仍有未由完整 Processor 結果證明的斷言。'],
                rationale='需要逐斷言的 JS/WASM 證據；既有 Processor 重播或 Python pytest 不足以宣稱涵蓋。', evidence=evidence)

rows = [classify(row) for row in unresolved if owned(row['nodeid'])]
ids = [row['nodeid'] for row in rows]
assert len(ids) == len(set(ids))
assert set(ids) == {row['nodeid'] for row in unresolved if owned(row['nodeid'])}
for row in rows:
    assert row['status'] in {'js-extra-pass', 'python-build-pass', 'unresolved'}
    assert row['assertions'] and row['rationale'] and row['evidence']
OUT.mkdir(exist_ok=True)
path = OUT / 'coverage.json'
if sys.argv[1:] == ['--check']:
    assert json.loads(path.read_text()) == rows, 'coverage.json differs from verified receipts'
else:
    assert not sys.argv[1:], 'usage: scope_coverage.py [--check]'
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print(dict(collections.Counter(row['status'] for row in rows)))
