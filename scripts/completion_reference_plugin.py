"""Capture the remaining runtime assertions and direct parser calls from upstream tests."""
import ast
import functools
import hashlib
import inspect
import json
import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pynini
from pynini.lib.pynutil import add_weight
from tn.processor import Processor, _UniqueOutputPathStream
from tn.token_parser import TokenParser
from scripts.export_models import export_model
from scripts import graph_reference_plugin as graphs

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.test-data/qa-completion-reference'
graphs.OUTPUT = OUT
CURRENT = None
EVENTS = []
RESULTS = []
SELECTED = []
WEIGHTED = {
    'test_weighted_field_restores_original_joint_path_costs',
    'test_joint_candidates_keep_raw_field_and_semantic_weight',
    'test_cardinal_raw_field_keeps_minimum_input_weight',
}
EXPLICIT = WEIGHTED | {
    'test_weighted_stream_projects_unique_outputs_before_expanding',
    'test_ip_priority_is_applied_once_outside_raw_field',
}


def emit(event):
    EVENTS.append({'nodeid': CURRENT, **event})


def from_test():
    frame = inspect.currentframe().f_back.f_back
    if frame.f_code.co_filename.endswith('/tn/token_parser.py'):
        frame = frame.f_back
    return '/test/' in frame.f_code.co_filename


def save_model(processor):
    direction = 'itn' if processor.ordertype.endswith('itn') else 'tn'
    with tempfile.TemporaryDirectory(prefix='qa-model-', dir=OUT) as temporary:
        manifest = export_model(processor, temporary, 'custom', direction)
        identity = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        destination = OUT / 'models' / identity
        if not destination.exists():
            shutil.copytree(temporary, destination)
    return identity


def weighted_paths(graph, text, count):
    stream = _UniqueOutputPathStream(pynini.accep(pynini.escape(text)) @ graph)
    rows = []
    for _ in range(count):
        path = stream.pop()
        if path is None:
            break
        rows.append({'text': path.text, 'weight': path.weight})
    return rows


def pytest_configure(config):
    (OUT / 'graphs').mkdir(parents=True, exist_ok=True)
    (OUT / 'models').mkdir(exist_ok=True)
    for method in ('parse', 'reorder'):
        original = getattr(TokenParser, method)

        def wrap(original, method):
            @functools.wraps(original)
            def call(self, tagged):
                record = CURRENT is not None and from_test()
                try:
                    result = original(self, tagged)
                except Exception as error:
                    if record:
                        emit({'kind': 'parser-error', 'operation': method, 'tagged': tagged,
                              'error': type(error).__name__, 'tokenOrders': self.orders})
                    raise
                if record and method == 'parse':
                    emit({'kind': 'tokens', 'tagged': tagged, 'tokenOrders': self.orders,
                          'expected': [{'name': token.name, 'members': dict(token.members), 'order': list(token.order)}
                                       for token in self.tokens]})
                elif record:
                    emit({'kind': 'reorder', 'tagged': tagged, 'tokenOrders': self.orders, 'expected': result})
                return result
            return call

        setattr(TokenParser, method, wrap(original, method))
    original_candidates = Processor._normalization_candidates

    @functools.wraps(original_candidates)
    def candidates(self, text, nbest):
        result = original_candidates(self, text, nbest)
        if CURRENT and CURRENT.split('::')[-1].split('[')[0] in WEIGHTED:
            emit({'kind': 'candidates', 'model': save_model(self), 'input': text, 'nbest': nbest,
                  'expected': [{'tagged': row.tagged, 'output': row.output,
                                'taggerWeight': row.tagger_weight, 'weight': row.weight} for row in result]})
        return result

    Processor._normalization_candidates = candidates


def pytest_collection_modifyitems(config, items):
    parser_functions = {}
    selected, deselected = [], []
    for item in items:
        file = Path(str(item.path))
        if file not in parser_functions:
            nodes = [node for node in ast.walk(ast.parse(file.read_text())) if isinstance(node, ast.FunctionDef)]
            needed = {node.name for node in nodes if any(
                isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr in ('parse', 'reorder')
                for call in ast.walk(node))}
            while True:
                indirect = {node.name for node in nodes if any(
                    isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id in needed
                    for call in ast.walk(node))}
                if indirect <= needed:
                    break
                needed |= indirect
            parser_functions[file] = needed
        name = item.originalname or item.name.split('[')[0]
        postprocessor = str(file).endswith('/tn/chinese/test/postprocessor_test.py')
        (selected if name in parser_functions[file] | EXPLICIT or postprocessor else deselected).append(item)
    items[:] = selected
    SELECTED.extend(item.nodeid.removeprefix('vendor/WeTextProcessing/') for item in selected)
    config.hook.pytest_deselected(items=deselected)
    assert selected, 'No completion assertions were collected'


def pytest_runtest_setup(item):
    global CURRENT
    CURRENT = item.nodeid.removeprefix('vendor/WeTextProcessing/')


def pytest_runtest_call(item):
    name = item.originalname or item.name.split('[')[0]
    if name == 'test_weighted_stream_projects_unique_outputs_before_expanding':
        tagged = 'counting { value: "input" }'
        verbalizer = pynini.union(*[add_weight(pynini.cross(tagged, 'A'), index / 2048.0) for index in range(2048)],
                                 add_weight(pynini.cross(tagged, 'B'), 1.0))
        stream = _UniqueOutputPathStream(pynini.accep(pynini.escape(tagged)) @ verbalizer)
        expected = [stream.pop().text, stream.pop().text]
        processor = SimpleNamespace(ordertype='tn', tagger=pynini.cross('input', tagged), verbalizer=verbalizer,
                                    token_parser=lambda: TokenParser())
        emit({'kind': 'unique-stream', 'model': save_model(processor), 'input': 'input',
              'expected': expected, 'limit': stream._limit})
    if name == 'test_ip_priority_is_applied_once_outside_raw_field':
        graph = item.funcargs['normalizer'].tagger
        text = 'one dot two dot three dot four'
        emit({'kind': 'weighted-paths', 'graph': graphs.graph_id(graph), 'input': text, 'nbest': 2,
              'expected': weighted_paths(graph, text, 2)})
    if name == 'test_cardinal_raw_field_keeps_minimum_input_weight':
        graph = item.module.Cardinal(enable_standalone_number=True, enable_0_to_9=True, enable_million=False).tagger
        emit({'kind': 'weighted-paths', 'graph': graphs.graph_id(graph), 'input': '一二', 'nbest': 1,
              'expected': weighted_paths(graph, '一二', 1)})
    if '/tn/chinese/test/postprocessor_test.py' in str(item.path) and name in ('test_processor', 'test_all_rules'):
        graph = item.instance.processor if name == 'test_processor' else item.module.PostProcessor(traditional_to_simple=True, tag_oov=True).processor
        emit({'kind': 'graph', 'operation': 'one_top_rewrite', 'graph': graphs.graph_id(graph),
              'input': item.callspec.params['written'], 'nbest': 1, 'expected': item.callspec.params['spoken']})


def pytest_runtest_logreport(report):
    RESULTS.append({'nodeid': report.nodeid.removeprefix('vendor/WeTextProcessing/'), 'phase': report.when, 'outcome': report.outcome})


def pytest_runtest_teardown(item):
    global CURRENT
    CURRENT = None


def pytest_sessionfinish(session, exitstatus):
    with (OUT / 'events.jsonl').open('w', encoding='utf-8') as file:
        for case_id, event in enumerate(EVENTS):
            file.write(json.dumps({'caseId': case_id, **event}, ensure_ascii=False) + '\n')
    (OUT / 'results.json').write_text(json.dumps(RESULTS, ensure_ascii=False) + '\n')
    (OUT / 'collected.json').write_text(json.dumps(SELECTED, ensure_ascii=False) + '\n')
    (OUT / 'summary.json').write_text(json.dumps({'exitstatus': int(exitstatus), 'collected': len(SELECTED),
        'events': len(EVENTS), 'graphs': len(graphs.GRAPHS)}, indent=2) + '\n')
