"""Capture direct graph and token assertions during selected original pytest cases."""
import hashlib
import json
import os
import tempfile
from pathlib import Path

import pynini
from pynini.lib import rewrite
from tn.token_parser import TokenParser

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / '.test-data/qa-graph-reference'
CURRENT = None
EVENTS = []
GRAPHS = {}
ASSIGNED = {row["nodeid"] for row in json.loads((ROOT / ".test-data/qa-full-coverage/processor-unresolved.json").read_text())}


def emit(event):
    if CURRENT in ASSIGNED:
        EVENTS.append({'nodeid': CURRENT, **event})


def graph_id(graph):
    with tempfile.NamedTemporaryFile(dir=OUTPUT / 'graphs', delete=False) as file:
        path = Path(file.name)
    try:
        graph.write(str(path))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        destination = OUTPUT / 'graphs' / (digest + '.fst')
        if destination.exists():
            path.unlink()
        else:
            path.rename(destination)
        GRAPHS[digest] = True
        return digest
    finally:
        path.unlink(missing_ok=True)


def pytest_configure(config):
    (OUTPUT / 'graphs').mkdir(parents=True, exist_ok=True)
    for name in ('top_rewrites', 'one_top_rewrite'):
        original = getattr(rewrite, name)
        def wrapped(input, rule, *args, _original=original, _name=name, **kwargs):
            if CURRENT is None:
                return _original(input, rule, *args, **kwargs)
            graph = graph_id(rule)
            try:
                result = _original(input, rule, *args, **kwargs)
            except Exception as error:
                emit({'kind': 'graph', 'operation': _name, 'graph': graph, 'input': pynini.accep(input).string(),
                      'nbest': args[0] if args else kwargs.get('nshortest', 1),
                      'error': type(error).__name__})
                raise
            emit({'kind': 'graph', 'operation': _name, 'graph': graph, 'input': pynini.accep(input).string(),
                  'nbest': args[0] if args else kwargs.get('nshortest', 1), 'expected': result})
            return result
        setattr(rewrite, name, wrapped)
    original_compose = pynini.compose
    def compose(left, right, *args, **kwargs):
        result = original_compose(left, right, *args, **kwargs)
        if CURRENT is not None and isinstance(right, pynini.Fst):
            try:
                input = pynini.accep(left).string() if isinstance(left, str) else left.string()
                emit({'kind': 'graph', 'operation': 'accepts', 'graph': graph_id(right),
                      'input': input, 'expected': result.start() != pynini.NO_STATE_ID})
            except (pynini.FstOpError, TypeError, ValueError):
                pass
        return result
    pynini.compose = compose
    original_parse = TokenParser.parse
    def parse(self, tagged):
        result = original_parse(self, tagged)
        emit({'kind': 'tokens', 'tagged': tagged, 'tokenOrders': self.orders,
              'expected': [{'name': token.name, 'members': token.members, 'order': token.order}
                           for token in self.tokens]})
        return result
    TokenParser.parse = parse


def pytest_runtest_setup(item):
    global CURRENT
    CURRENT = item.nodeid.removeprefix('vendor/WeTextProcessing/')


def pytest_runtest_call(item):
    function = item.name.split('[')[0]
    if function in ('test_rejected_inputs', 'test_invalid_inputs') and 'rules' in item.funcargs:
        rule = item.funcargs['rules'][item.callspec.params['name']]
        spoken = item.callspec.params['spoken']
        emit({'kind': 'graph', 'operation': 'accepts', 'graph': graph_id(rule.tagger),
              'input': spoken, 'expected': False})
    if function == 'test_no_empty_tagger_path_and_empty_api' and 'rules' in item.funcargs:
        rule = item.funcargs['rules'][item.callspec.params['name']]
        emit({'kind': 'graph', 'operation': 'accepts', 'graph': graph_id(rule.tagger),
              'input': '', 'expected': False})
    if function == 'test_electronic_rejects_written_terminal_period' and 'rules' in item.funcargs:
        rule = item.funcargs['rules']['electronic']
        emit({'kind': 'graph', 'operation': 'accepts', 'graph': graph_id(rule.tagger),
              'input': 'a b c punkt com.', 'expected': False})
    if 'itn/german/test/numeric_test.py::test_ordinal_does_not_double_cardinal_semantic_weights' in item.nodeid:
        rules = item.funcargs['rules']
        for name, spoken in [('cardinal', 'ein hundert und drei und zwanzig'),
                             ('ordinal', 'ein hundert und drei und zwanzigster')]:
            graph = rules[name].graph
            path = pynini.shortestpath(spoken @ graph).paths()
            emit({'kind': 'graph', 'operation': 'weight', 'graph': graph_id(graph),
                  'input': spoken, 'nbest': 1, 'expected': float(path.weight())})
    if item.nodeid.endswith('cardinal_test.py::TestCardinal::test_number'):
        return
    if 'tn/chinese/test/cardinal_test.py::TestCardinal::test_number[' in item.nodeid:
        written = item.callspec.params['written']
        spoken = item.callspec.params['spoken']
        graph = item.instance.cardinal.number
        emit({'kind': 'graph', 'operation': 'one_top_rewrite', 'graph': graph_id(graph),
              'input': written, 'nbest': 1, 'expected': spoken})


def pytest_runtest_teardown(item):
    global CURRENT
    CURRENT = None


def pytest_sessionfinish(session, exitstatus):
    with (OUTPUT / 'events.jsonl').open('w', encoding='utf-8') as file:
        for event in EVENTS:
            file.write(json.dumps(event, ensure_ascii=False) + '\n')
    (OUTPUT / 'summary.json').write_text(json.dumps({'exitstatus': int(exitstatus),
        'collected': session.testscollected, 'events': len(EVENTS), 'graphs': len(GRAPHS)}, indent=2) + '\n')
