# Copyright (c) 2022 Xingchen Song (sxc19@tsinghua.edu.cn)
# Copyright (c) 2022 Zhendong Peng (pzd17@tsinghua.org.cn)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Adapted from WeTextProcessing's Chinese ITN rules at the pinned revision.

"""Apply the Chinese ITN dictation build option using the pinned upstream rules."""
from pathlib import Path

from pynini import accep, arcmap, cross, difference, string_file, string_map
from pynini.lib.pynutil import add_weight, delete, insert

from itn.chinese.inverse_normalizer import TOKEN_ORDERS
from itn.chinese.rules.cardinal import Cardinal
from itn.chinese.rules.char import Char
from itn.chinese.rules.date import Date
from itn.chinese.rules.fraction import Fraction
from itn.chinese.rules.license_plate import LicensePlate
from itn.chinese.rules.math import Math
from itn.chinese.rules.measure import Measure
from itn.chinese.rules.money import Money
from itn.chinese.rules.postprocessor import PostProcessor
from itn.chinese.rules.time import Time
from itn.chinese.rules.train_number import TrainNumber
from itn.chinese.rules.whitelist import Whitelist
from itn.utils import get_abs_path
from tn.processor import Processor, RuleSpec
from tn.utils import get_abs_path as get_tn_path


def rows(path):
    return [line.split("\t") for line in Path(path).read_text().splitlines() if line]


def input_language(graph):
    return arcmap(graph.copy().project("input"), map_type="rmweight").optimize()


def replace_inputs(graph, replacement):
    # Remove old alternatives too, so nbest cannot restore the unwanted format.
    remaining = difference(input_language(graph), input_language(replacement))
    return ((remaining @ graph) | replacement).optimize()


def create_dictation_model(*, remove_interjections=True, enable_standalone_number=True,
                           enable_0_to_9=False, enable_million=False):
    model = Processor("zh_inverse_normalizer", ordertype="itn", token_orders=TOKEN_ORDERS)
    aliases = string_file(get_tn_path("chinese/data/char/traditional_to_simple.tsv"))
    aliases |= string_map([("廿", "二十"), ("卅", "三十"), ("〇", "零")])
    canonical = model.build_rule(aliases)
    traditional_magnitudes = model.build_rule(string_map([("万", "萬"), ("亿", "億")]))

    def number_graph(graph):
        return (canonical @ graph @ traditional_magnitudes).optimize()

    cardinal = Cardinal(enable_standalone_number, enable_0_to_9, enable_million)
    cardinal.number = number_graph(cardinal.number)
    cardinal.number_exclude_0_to_9 = number_graph(cardinal.number_exclude_0_to_9)
    digits = string_file(get_abs_path("chinese/data/number/digit.tsv")) | string_file(get_abs_path("chinese/data/number/zero.tsv"))
    compact_digits = (canonical @ digits.closure(3)).optimize()
    cardinal.cardinal = replace_inputs(number_graph(cardinal.cardinal), compact_digits)
    cardinal.tagger = cardinal.add_tokens(cardinal.tag_field("value", cardinal.cardinal))
    cardinal.build_verbalizer()

    measure = Measure(enable_0_to_9=enable_0_to_9, cardinal=cardinal)
    units = string_file(get_abs_path("chinese/data/measure/units_zh.tsv"))
    units |= add_weight(string_file(get_abs_path("chinese/data/measure/units_en.tsv")) | cross("度", "°"), -1.0)
    units = Processor.input_projection(canonical @ units)
    number = cardinal.number if enable_0_to_9 else cardinal.number_exclude_0_to_9
    measure.numerator = (number + (cross("到", "~") + number).ques + units).optimize()
    measure.denominator = delete("每") + units
    digit = canonical @ string_file(get_abs_path("chinese/data/number/digit.tsv"))
    colloquial_money = cardinal.number + (accep("块") | accep("塊")) + digit + (accep("毛") | delete("角")).ques
    measure.value = replace_inputs(canonical @ measure.value, measure.numerator | colloquial_money)
    fields = measure.tag_field("value", measure.value)
    fields |= measure.tag_field("denominator", measure.denominator) + insert(" ") + measure.tag_field("numerator", measure.numerator)
    measure.tagger = measure.add_tokens(fields)
    measure.build_verbalizer()

    date = Date()
    date.year = (canonical @ date.year_only).optimize()
    date.year_only = date.year
    for field, filename in (("month", "mm.tsv"), ("day", "dd.tsv")):
        pairs = [(source, str(int(value)) + ("號" if source.endswith("号") else source[-1]))
                 for source, value in rows(get_abs_path(f"chinese/data/date/{filename}"))]
        setattr(date, field, (canonical @ string_map(pairs)).optimize())
    year = date.tag_field("year", date.year)
    month = date.tag_field("month", date.month)
    day = insert(" ") + date.tag_field("day", date.day)
    fields = year + insert(" ") + month + day.ques | month + day
    fields |= year + insert(' preserve_order: "true"')
    date.tagger = date.add_tokens(fields)
    year = date.verbalize_field("year", date.year)
    month = date.verbalize_field("month", date.month)
    day = date.verbalize_field("day", date.day, leading_space=True)
    fields = (year + delete(" ")).ques + month + day.ques
    fields |= year + delete(' preserve_order: "true"')
    date.verbalizer = date.delete_tokens(fields)

    time = Time()
    for field in ("hour", "minute", "minute_tagger", "minute_zero_no_fen", "second", "noon"):
        setattr(time, field, (canonical @ getattr(time, field)).optimize())
    hour = time.tag_field("hour", time.hour)
    minute = insert(" ") + time.tag_field("minute", time.minute_tagger)
    second = (insert(" ") + time.tag_field("second", time.second)).ques
    noon = time.tag_field("noon", time.noon) + insert(" ")
    fields = noon.ques + hour + minute + second
    fields |= noon + hour + insert(" ") + time.tag_field("minute", time.minute_zero_no_fen) + second
    time.tagger = time.add_tokens(fields)
    time.build_verbalizer()

    whitelist = Whitelist()
    identity = string_map([(entry[0], entry[0]) for entry in rows(get_abs_path("chinese/data/default/whitelist.tsv"))
                           if len(entry) == 1 or entry[0] == entry[1]])
    identity |= string_map([("三三两两", "三三两两")])
    # Keep the original glyphs of protected words, including Traditional variants.
    whitelist.graph = replace_inputs(whitelist.graph, input_language(canonical @ identity))
    whitelist.tagger = whitelist.add_tokens(whitelist.tag_field("value", whitelist.graph))
    whitelist.build_verbalizer()

    rules = (
        RuleSpec(date, 1.02), RuleSpec(whitelist, 1.01),
        RuleSpec(Fraction(cardinal=cardinal), 1.05), RuleSpec(measure, 1.05),
        RuleSpec(Money(enable_0_to_9=enable_0_to_9, cardinal=cardinal), 1.04), RuleSpec(time, 1.05),
        RuleSpec(cardinal, 1.06), RuleSpec(Math(cardinal=cardinal), 1.10),
        RuleSpec(LicensePlate(), 1.0), RuleSpec(TrainNumber(), 1.0), RuleSpec(Char(), 100),
    )
    model.tagger = model.tagger_union(rules).star @ model.build_rule(delete(" "), "", "[EOS]")
    model.verbalizer = (model.verbalizer_union(rules) @ PostProcessor(remove_interjections=remove_interjections).processor).star
    return model
