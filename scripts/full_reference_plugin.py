"""Capture per-case Processor behavior from the unmodified upstream pytest suite."""
import functools
import hashlib
import inspect
import json
import shutil
import tempfile
import os
from types import SimpleNamespace
import weakref
from pathlib import Path

from tn.cli import PIPELINES
from tn.processor import Processor
from scripts.export_models import ROOT, export_model
from scripts.reference_plugin import serialize

OUTPUT = Path(os.environ.get("WETEXT_QA_REFERENCE", ROOT / ".test-data/qa-full-reference"))
PIPELINE_MODULES = {spec.module: (language, direction) for direction, pipelines in PIPELINES.items() for language, spec in pipelines.items()}
CURRENT = None
CONFIGS = weakref.WeakKeyDictionary()
MODELS = weakref.WeakKeyDictionary()
COUNTS = {"calls": 0, "errors": 0, "models": set(), "results": {}}


def record(entry):
    with (OUTPUT / "events.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(entry, ensure_ascii=False) + "\n")


def model_id(processor):
    if processor.tagger is None and processor.verbalizer is None:
        return None
    graphs = (id(processor.tagger), id(processor.verbalizer))
    cached = MODELS.get(processor)
    if cached and cached[0] == graphs:
        return cached[1]
    language, direction = PIPELINE_MODULES.get(type(processor).__module__, ("custom", processor.ordertype))
    with tempfile.TemporaryDirectory(prefix="qa-export-", dir=OUTPUT) as temporary:
        if processor.tagger is None or processor.verbalizer is None:
            from pynini import accep
            exportable = SimpleNamespace(tagger=processor.tagger if processor.tagger is not None else accep(""), verbalizer=processor.verbalizer if processor.verbalizer is not None else accep(""), token_parser=processor.token_parser)
        else:
            exportable = processor
        manifest = export_model(exportable, temporary, language, direction, CONFIGS.get(processor, {}))
        identity = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        destination = OUTPUT / "models" / identity
        if not destination.exists():
            shutil.copytree(temporary, destination)
    MODELS[processor] = (graphs, identity)
    COUNTS["models"].add(identity)
    return identity


def pytest_configure(config):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "models").mkdir(exist_ok=True)
    (OUTPUT / "events.jsonl").write_text("")
    original_build = Processor.build_fst

    @functools.wraps(original_build)
    def build(self, prefix, cache_dir, overwrite_cache, cache_config=None):
        result = original_build(self, prefix, cache_dir, overwrite_cache, cache_config)
        CONFIGS[self] = cache_config or {}
        return result

    Processor.build_fst = build
    for name in ("tag", "verbalize", "normalize", "normalize_with_mapping"):
        original = getattr(Processor, name)
        signature = inspect.signature(original)

        def wrap(method, method_name, method_signature):
            @functools.wraps(method)
            def call(self, *args, **kwargs):
                if CURRENT is None:
                    return method(self, *args, **kwargs)
                bound = method_signature.bind(self, *args, **kwargs)
                bound.apply_defaults()
                options = {key: value for key, value in bound.arguments.items() if key not in ("self", "input")}
                if "include_identity" in options:
                    options["includeIdentity"] = options.pop("include_identity")
                entry = {"nodeid": CURRENT, "phase": "call", "kind": "processor", "method": "normalizeWithMapping" if method_name == "normalize_with_mapping" else method_name, "input": bound.arguments["input"], "options": options}
                try:
                    result = method(self, *args, **kwargs)
                except Exception as error:
                    entry["error"] = {"type": type(error).__name__, "message": str(error)}
                    COUNTS["errors"] += 1
                    raise
                else:
                    entry["expected"] = serialize(result)
                    COUNTS["calls"] += 1
                    return result
                finally:
                    entry["model"] = model_id(self)
                    record(entry)
            return call

        setattr(Processor, name, wrap(original, name, signature))


def pytest_collection_finish(session):
    ids = [item.nodeid.removeprefix("vendor/WeTextProcessing/") for item in session.items]
    (OUTPUT / "collected.json").write_text(json.dumps(ids, ensure_ascii=False) + "\n")


def pytest_runtest_setup(item):
    global CURRENT
    CURRENT = item.nodeid.removeprefix("vendor/WeTextProcessing/")


def pytest_runtest_logreport(report):
    nodeid = report.nodeid.removeprefix("vendor/WeTextProcessing/")
    COUNTS["results"][report.outcome] = COUNTS["results"].get(report.outcome, 0) + 1
    record({"nodeid": nodeid, "phase": report.when, "kind": "result", "outcome": report.outcome})


def pytest_runtest_teardown(item):
    global CURRENT
    CURRENT = item.nodeid.removeprefix("vendor/WeTextProcessing/")


def pytest_sessionfinish(session, exitstatus):
    summary = {"exitstatus": int(exitstatus), "collected": session.testscollected, "calls": COUNTS["calls"], "errors": COUNTS["errors"], "models": sorted(COUNTS["models"]), "results": COUNTS["results"]}
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
