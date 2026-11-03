"""Record upstream public API results while running the unmodified pytest suite."""
import functools
import hashlib
import inspect
import json
import shutil
import tempfile
import weakref
from pathlib import Path

from tn.cli import PIPELINES
from tn.processor import Processor
from scripts.export_models import ROOT, export_model

OUTPUT = ROOT / ".test-data" / "qa-reference"
PIPELINE_MODULES = {spec.module: (language, direction) for direction, pipelines in PIPELINES.items() for language, spec in pipelines.items()}
MODELS = weakref.WeakKeyDictionary()
CONFIGS = weakref.WeakKeyDictionary()
COUNTS = {"calls": 0, "models": set()}
RECORDS = None


def serialize(value):
    if hasattr(value, "as_dict"):
        value = value.as_dict()
    if isinstance(value, dict):
        return {("tokenType" if key == "token_type" else key): serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize(item) for item in value]
    return value


def model_id(processor):
    graphs = (id(processor.tagger), id(processor.verbalizer))
    cached = MODELS.get(processor)
    if cached and cached[0] == graphs:
        return cached[1]
    language, direction = PIPELINE_MODULES[type(processor).__module__]
    with tempfile.TemporaryDirectory(prefix="qa-export-", dir=OUTPUT) as temporary:
        manifest = export_model(processor, temporary, language, direction, CONFIGS.get(processor, {}))
        identity = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        destination = OUTPUT / "models" / identity
        if not destination.exists():
            shutil.copytree(temporary, destination)
    MODELS[processor] = (graphs, identity)
    COUNTS["models"].add(identity)
    return identity


def pytest_configure(config):
    global RECORDS
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "models").mkdir(exist_ok=True)
    RECORDS = (OUTPUT / "calls.jsonl").open("w", encoding="utf-8")
    original_build = Processor.build_fst

    @functools.wraps(original_build)
    def build(self, prefix, cache_dir, overwrite_cache, cache_config=None):
        result = original_build(self, prefix, cache_dir, overwrite_cache, cache_config)
        if type(self).__module__ in PIPELINE_MODULES:
            CONFIGS[self] = cache_config or {}
        return result

    Processor.build_fst = build
    for name in ("tag", "verbalize", "normalize", "normalize_with_mapping"):
        original = getattr(Processor, name)
        signature = inspect.signature(original)

        def wrap(method, method_name, method_signature):
            @functools.wraps(method)
            def call(self, *args, **kwargs):
                result = method(self, *args, **kwargs)
                if type(self).__module__ in PIPELINE_MODULES:
                    bound = method_signature.bind(self, *args, **kwargs)
                    bound.apply_defaults()
                    options = {key: value for key, value in bound.arguments.items() if key not in ("self", "input")}
                    if "include_identity" in options:
                        options["includeIdentity"] = options.pop("include_identity")
                    entry = {
                        "model": model_id(self),
                        "method": "normalizeWithMapping" if method_name == "normalize_with_mapping" else method_name,
                        "input": bound.arguments["input"],
                        "options": options,
                        "expected": serialize(result),
                    }
                    RECORDS.write(json.dumps(entry, ensure_ascii=False) + "\n")
                    COUNTS["calls"] += 1
                return result
            return call
        setattr(Processor, name, wrap(original, name, signature))


def pytest_sessionfinish(session, exitstatus):
    RECORDS.close()
    summary = {"exitstatus": int(exitstatus), "calls": COUNTS["calls"], "models": sorted(COUNTS["models"]), "tests": session.testscollected}
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
