"""Independent Python token parser expectations for assigned upstream cases."""
import json
from pathlib import Path
from tn.token_parser import TokenParser, TokenParseError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.test-data/qa-core-reference'
OUT.mkdir(parents=True, exist_ok=True)
prefix = 'tn/chinese/test/token_parser_test.py::TestTokenParser::'
base = 'time { minute: "零二分" hour: "两点" } char { value: "走" }'
fixtures = [
    ('test_parse', base, 'parse'),
    ('test_reorder', base, 'reorder'),
    ('test_reorder_preserves_unknown_fields', 'money { unexpected: "keep" currency: "元" value: "十" }', 'reorder'),
    ('test_reorder_round_trips_escaped_unicode_value', 'char { value: "中\\"文\\\\尾" }', 'both'),
    ('test_parse_value_decodes_wire_escapes', 'char { value: "中\\"文\\\\尾" }', 'parse'),
    ('test_duplicate_field_is_rejected', 'char { value: "first" value: "second" }', 'error'),
]
for index, tagged in enumerate(['time { hour: "12 }', 'time { hour "12" }', 'time { hour: "12" ']):
    fixtures.append((f'test_malformed_input[{tagged}]', tagged, 'error'))
rows = []
for name, tagged, action in fixtures:
    parser = TokenParser()
    row = {'nodeid': prefix + name, 'input': tagged, 'action': action}
    try:
        parser.parse(tagged)
        row['tokens'] = [{'name': token.name, 'fields': list(token.members.items())} for token in parser.tokens]
        if action in ('reorder', 'both'):
            row['reordered'] = parser.reorder(tagged)
    except TokenParseError as error:
        row['error'] = type(error).__name__
    rows.append(row)
(OUT / 'parser.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print(f'{len(rows)} parser fixtures')

from pynini import cross, union, escape
from pynini.lib.pynutil import add_weight, delete, insert

cases = [
    ('test_trace_input_spans_uses_the_wfst_path', cross('1', 'char { value: "1" }') + cross('23', ' math { value: "23" }'), '123', None, 'input', [[0,19],[20,40]], [[0,1],[1,3]]),
    ('test_transduce_with_spans_leaves_inserted_separator_unowned', cross('a','A') + insert(' ') + cross('b','B'), 'ab', None, 'output', [[0,1],[1,2]], [[0,1],[2,3]]),
    ('test_transduce_with_spans_leaves_unicode_whitespace_unowned[\\xa0]', cross('a','A') + insert('\u00a0') + cross('b','B'), 'ab', None, 'output', [[0,1],[1,2]], [[0,1],[2,3]]),
    ('test_transduce_with_spans_leaves_unicode_whitespace_unowned[\\u3000]', cross('a','A') + insert('\u3000') + cross('b','B'), 'ab', None, 'output', [[0,1],[1,2]], [[0,1],[2,3]]),
    ('test_transduce_with_spans_covers_deletion_and_unicode', cross('蘋','苹') + delete('-') + cross('果','果'), '蘋-果', None, 'output', [[0,1],[1,2],[2,3]], [[0,1],[1,1],[1,2]]),
    ('test_deleted_token_anchor_follows_delayed_boundary_output', cross('a','A') + insert('X') + delete('b'), 'ab', None, 'output', [[0,1],[1,2]], [[0,2],[2,2]]),
    ('test_transduce_with_spans_rejects_empty_input_spans', cross('a','A'), 'a', None, 'output-error', [[0,0],[0,1]], None),
    ('test_transduce_with_spans_traces_the_selected_non_shortest_output', union(cross('a','A'),add_weight(cross('a','ALT'),1.0)), 'a', 'ALT', 'output', [[0,1]], [[0,3]]),
    ('test_transduce_without_spans_preserves_empty_output', delete('a'), 'a', None, 'text', [], []),
]
for selected in [None, '别名 "[x]"\\\\']:
    source = '原文 "[x]"\\\\'
    graph = union(cross(escape(source), escape('规范化😀')), add_weight(cross(escape(source), escape('别名 "[x]"\\\\')), 1.0))
    for helper in ['_linear_arcs', '_text_boundaries']:
        name = f'test_transduce_without_spans_skips_tracking_helpers[{"None" if selected is None else "\\\\u522b\\\\u540d \"[x]\"\\\\\\\\"}-{helper}]'
        if selected is not None:
            ids = json.loads((ROOT / '.test-data/qa-full-coverage/processor-unresolved.json').read_text())
            name = next(row['nodeid'].split('::')[-1] for row in ids if 'test_transduce_without_spans_skips_tracking_helpers' in row['nodeid'] and '\\u522b' in row['nodeid'] and row['nodeid'].endswith(helper + ']'))
        cases.append((name, graph, source, selected, 'text', [], []))
for selected, source in [(None, 'missing'), ('missing', 'a')]:
    name = f'test_transduce_without_spans_rejects_missing_paths[{"None" if selected is None else "missing"}]'
    cases.append((name, cross('a','A'), source, selected, 'missing', [], []))
alignment_rows = []
for index, (name, graph, source, selected, mode, spans, expected_spans) in enumerate(cases):
    path = OUT / f'graph-{index}.fst'
    graph.optimize().write(str(path))
    from tn.alignment import transduce_with_spans, trace_input_spans
    if mode == 'input':
        expected_text = 'char { value: \"1\" } math { value: \"23\" }'
        assert trace_input_spans(source, expected_text, graph, spans) == tuple(map(tuple, expected_spans))
    elif mode == 'missing':
        expected_text = None
    else:
        expected_text, python_spans = transduce_with_spans(source, graph, spans, output_text=selected) if mode != 'output-error' else ('A', ())
        if mode == 'output': assert python_spans == tuple(map(tuple, expected_spans))
    alignment_rows.append({'id': index, 'nodeid': 'tn/chinese/test/alignment_test.py::' + name, 'graph': path.name, 'input': source, 'output': selected, 'expected': expected_text, 'mode': mode, 'spans': spans, 'expectedSpans': expected_spans})
(OUT / 'alignment.json').write_text(json.dumps(alignment_rows, ensure_ascii=False, indent=2) + '\n')
print(f'{len(alignment_rows)} alignment graphs')
