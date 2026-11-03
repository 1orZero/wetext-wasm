"""Generate small runtime fixtures from upstream Python, without a JS oracle."""
import json

from pynini import accep, cross, escape, union
from pynini.lib.pynutil import add_weight, insert
from tn.chinese.test.processor_test import (
    JointItnProcessor, RawAmbiguousProcessor, WeightedFieldProcessor, WeightedJointProcessor,
)
from tn.processor import Processor
from scripts.export_models import ROOT, export_model
from scripts.reference_plugin import serialize

OUTPUT = ROOT / "test" / "fixtures" / "qa-core"
records = []


def record(name, processor, text="input", counts=(1, 2, 3, 8)):
    export_model(processor, OUTPUT / name, "qa", "itn" if processor.ordertype == "itn" else "tn")
    for nbest in counts:
        for method in ("tag", "normalize", "normalize_with_mapping"):
            kwargs = {"nbest": nbest}
            if method == "normalize_with_mapping":
                kwargs["include_identity"] = True
            expected = serialize(getattr(processor, method)(text, **kwargs))
            options = {"includeIdentity" if key == "include_identity" else key: value for key, value in kwargs.items()}
            records.append({"model": name, "method": "normalizeWithMapping" if method == "normalize_with_mapping" else method,
                            "input": text, "options": options, "expected": expected})


for name, cls in (("raw-ambiguity", RawAmbiguousProcessor), ("joint-weights", WeightedJointProcessor),
                  ("joint-itn", JointItnProcessor), ("weighted-field", WeightedFieldProcessor)):
    record(name, cls())

# Cases adapted from upstream tn/chinese/test/processor_test.py (Apache-2.0).
first = 'counting { value: "first" }'
second = 'counting { value: "second" }'
processor = WeightedJointProcessor()
processor.verbalizer = union(cross(first, "SAME"), add_weight(cross(first, "FIRST_ALT"), 2.0),
                            cross(second, "SAME"), add_weight(cross(second, "SECOND_ALT"), 1.0))
record("duplicate-outputs", processor)
processor.verbalizer = cross(second, "SECOND")
record("missing-branch", processor)

processor = RawAmbiguousProcessor()
tagged = 'counting { value: "input" }'
processor.verbalizer = union(*[add_weight(cross(tagged, "A"), i / 2048.0) for i in range(2048)],
                            add_weight(cross(tagged, "B"), 1.0))
record("duplicate-paths", processor, counts=(1, 2))

text = '你好 "[x]"\\\\１２時😀'
processor = Processor("identity")
processor.tagger = processor.add_tokens(processor.tag_field("value", accep(escape(text))))
processor.build_verbalizer()
record("escaped-unicode", processor, text, counts=(1, 2))

for name, separator in (("space", " "), ("nbsp", "\u00a0"), ("wide-space", "\u3000")):
    processor = Processor("boundaries")
    a = 'char { value: "a" }'
    b = 'char { value: "b" }'
    processor.tagger = cross("a", a) + insert(" ") + cross("b", b)
    processor.verbalizer = cross(a, "A") + cross(" ", "") + insert(separator) + cross(b, "😀")
    record(name, processor, "ab", counts=(1,))

processor.verbalizer = cross(a, "A") + insert("X") + cross(" " + b, "")
record("deleted-boundary", processor, "ab", counts=(1,))

(OUTPUT / "calls.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Exported {len(records)} Python reference calls to {OUTPUT}")
