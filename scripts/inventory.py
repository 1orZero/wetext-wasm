"""Inventory every collected upstream nodeid and its test assertion shapes."""
import ast
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / 'vendor/WeTextProcessing'
IDS = json.loads((ROOT / '.test-data/qa-full-reference/collected.json').read_text())
METHODS = {'normalize', 'tag', 'verbalize', 'normalize_with_mapping'}
FUNCTIONS = {}
for path in VENDOR.rglob('*test*.py'):
    relative = path.relative_to(VENDOR).as_posix()
    tree = ast.parse(path.read_text(encoding='utf-8'), filename=relative)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
            parent = next((c.name for c in tree.body if isinstance(c, ast.ClassDef) and node in c.body), None)
            key = (relative, parent, node.name)
            FUNCTIONS[key] = node

rows = []
for identifier in IDS:
    parts = identifier.split('::')
    path, name = parts[0], re.sub(r'\[.*$', '', parts[-1])
    parent = parts[1] if len(parts) > 2 else None
    key = (path, parent, name)
    if key not in FUNCTIONS:
        # Preserve an exact unresolved case if a nodeid came from a dynamic test.
        rows.append({'nodeid': identifier, 'file': path, 'function': name, 'category': '待人工分類', 'shapes': ['missing_ast']})
        continue
    node = FUNCTIONS[key]
    calls = {n.func.attr for n in ast.walk(node) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)}
    source = ast.get_source_segment((VENDOR / path).read_text(encoding='utf-8'), node) or ''
    api = bool(calls & METHODS)
    raw = bool(calls & {'compose', 'shortestpath', 'string', 'one_top_rewrite', 'top_rewrites', 'rewrite_lattice', 'start', 'paths', 'accepts'}) or bool(re.search(r'\s@\s', source))
    exception = bool(re.search(r'pytest\.raises|raises\(', source))
    mock = bool(re.search(r'monkeypatch|unittest\.mock|\bpatch\(', source))
    structure = bool(re.search(r'find_spec|import_module|TOKEN_ORDER|token_orders|\.graph|\.tagger|\.verbalizer|\.fst|\.number\b|\.integer\b', source))
    if '/token_parser_test.py' in path: category = 'token parser'
    elif '/alignment_test.py' in path: category = 'alignment runtime'
    elif path.endswith(('cache_test.py', 'cache_safety_test.py', 'cli_test.py', 'utils_test.py')): category = '純build/cache/CLI/grammar結構驗證' if not api else '待人工分類'
    elif path.endswith('processor_test.py') or path.endswith('postprocessor_test.py'): category = '待人工分類'
    elif path.startswith('tn/test/') and path.endswith(('robustness_test.py', 'punctuation_spacing_test.py')): category = '完整pipeline公開API'
    elif raw or (structure and api): category = '待人工分類' if api else 'raw FST / graph'
    elif path.endswith(('normalizer_test.py', 'inverse_normalizer_test.py', 'test_inverse_normalizer.py')) or path.startswith('tn/test/'):
        category = '完整pipeline公開API' if api else '待人工分類'
    elif api: category = '個別Processor規則API'
    elif structure: category = '純build/cache/CLI/grammar結構驗證'
    else: category = '待人工分類'
    shapes = [x for x, yes in [('api', api), ('raw', raw), ('exception', exception), ('mock', mock), ('structure', structure)] if yes]
    rows.append({'nodeid': identifier, 'file': path, 'function': name, 'category': category, 'shapes': shapes})

function_counts = collections.Counter((r['file'], r['function'], r['category'], tuple(r['shapes'])) for r in rows)
function_rows = [{'file': f, 'function': n, 'category': c, 'shapes': list(s), 'cases': count} for (f,n,c,s),count in sorted(function_counts.items())]
file_counts = collections.Counter(r['file'] for r in rows)
category_counts = collections.Counter(r['category'] for r in rows)
report = {'total_cases': len(rows), 'collected_files': len(file_counts), 'source_test_files': len(list(VENDOR.rglob('*test*.py'))), 'categories': dict(category_counts), 'files': dict(sorted(file_counts.items())), 'functions': function_rows, 'missing_ast': [r['nodeid'] for r in rows if 'missing_ast' in r['shapes']]}
out = ROOT / '.test-data/qa-coverage-audit/inventory.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
assert len(rows) == 27178
assert sum(file_counts.values()) == sum(category_counts.values()) == sum(x['cases'] for x in function_rows) == len(rows)
print(json.dumps({'categories': category_counts, 'files': len(file_counts), 'functions': len(function_rows), 'missing_ast': len(report['missing_ast'])}, ensure_ascii=False, indent=2))
