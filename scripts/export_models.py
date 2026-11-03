"""Export versioned OpenFst bundles for the JavaScript runtime."""
import argparse
import gc
import hashlib
import importlib
import inspect
import json
from pathlib import Path

from tn.cli import PIPELINES

REVISION = "c3b4d88d11c5efef817881f7e515cbdd3a19d99b"
ROOT = Path(__file__).resolve().parents[1]


def export_model(processor, destination, language, direction, options=None):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, graph in (("tagger.fst", processor.tagger), ("verbalizer.fst", processor.verbalizer)):
        path = destination / name
        graph.write(str(path))
        data = path.read_bytes()
        files[name] = {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
    manifest = {
        "format": 1,
        "upstream": REVISION,
        "language": language,
        "direction": direction,
        "options": options or {},
        "tokenOrders": processor.token_parser().orders,
        "files": files,
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language", default="zh")
    parser.add_argument("--direction", choices=("tn", "itn"), default="itn")
    parser.add_argument("--options", default="{}", help="JSON object of Python constructor options")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--all", action="store_true", help="Export all default language/direction bundles")
    args = parser.parse_args()
    options = json.loads(args.options)
    if not isinstance(options, dict) or any(type(value) is not bool for value in options.values()):
        parser.error("--options must be a JSON object with boolean values")
    if args.all and (options or args.output):
        parser.error("--all cannot be combined with --options or --output")
    selected = [(direction, language) for direction, languages in PIPELINES.items() for language in languages] if args.all else [(args.direction, args.language)]
    for direction, language in selected:
        if language not in PIPELINES[direction]:
            parser.error(f"unsupported {direction} language: {language}")
        spec = PIPELINES[direction][language]
        cls = getattr(importlib.import_module(spec.module), spec.class_name)
        parameters = inspect.signature(cls).parameters
        defaults = {name: param.default for name, param in parameters.items() if type(param.default) is bool and name != "overwrite_cache"}
        if options.keys() - defaults.keys():
            parser.error(f"unknown options: {sorted(options.keys() - defaults.keys())}")
        config = {**defaults, **options}
        target = args.output or ROOT / "models" / f"{language}-{direction}"
        print(f"Exporting {language}-{direction}: {config}", flush=True)
        processor = cls(cache_dir=False, **config)
        manifest = export_model(processor, target, language, direction, config)
        print(f"Exported {target}: {sum(file['size'] for file in manifest['files'].values()):,} bytes", flush=True)
        del processor
        gc.collect()


if __name__ == "__main__":
    main()
