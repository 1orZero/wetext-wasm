// Copyright (c) 2022 Zhendong Peng (pzd17@tsinghua.org.cn)
// Copyright (c) 2026, WENET COMMUNITY.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified graph operations from WeTextProcessing tn/processor.py and tn/alignment.py
// for Emscripten bindings. Uses OpenFst and the Pynini path iterator.
// Source: https://github.com/wenet-e2e/WeTextProcessing/tree/c3b4d88d11c5efef817881f7e515cbdd3a19d99b

#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_set>

#include <emscripten/bind.h>
#include <fst/fstlib.h>
#include <fst/verify.h>
#include "paths.h"

using emscripten::val;
using Fst = fst::StdVectorFst;
using Arc = fst::StdArc;

namespace {
void Check(const Fst& graph) {
  if (graph.Properties(fst::kError, true)) {
    throw std::runtime_error("OpenFst operation failed");
  }
}

Fst Compile(const std::string& text) {
  Fst result;
  if (!fst::StringCompiler<Arc>(fst::TokenType::BYTE)(text, &result)) {
    throw std::invalid_argument("Cannot encode input as a byte FST");
  }
  return result;
}

class Lattice {
 public:
  explicit Lattice(Fst graph) : graph_(std::move(graph)) {
    fst::Project(&graph_, fst::ProjectType::OUTPUT);
    fst::RmEpsilon(&graph_);
    Check(graph_);
  }

  val Paths(int count) const {
    if (count < 1) throw std::invalid_argument("nbest must be positive");
    Fst shortest;
    fst::ShortestPath(graph_, &shortest, count, true);
    Check(shortest);
    val result = val::array();
    fst::StringPathIterator<Arc> paths(shortest);
    if (paths.Error()) throw std::runtime_error("Cannot enumerate WFST paths");
    for (; !paths.Done(); paths.Next()) {
      val item = val::object();
      item.set("text", paths.OString());
      // Python converts weights through OpenFst's textual representation.
      std::ostringstream weight;
      weight.precision(9);
      weight << paths.Weight();
      item.set("weight", std::stod(weight.str()));
      result.call<void>("push", item);
    }
    if (paths.Error()) throw std::runtime_error("Cannot decode WFST output");
    return result;
  }

 private:
  Fst graph_;
};

class Graph {
 public:
  explicit Graph(const std::string& path) : graph_(Fst::Read(path)) {
    if (!graph_ || !fst::Verify(*graph_)) {
      throw std::invalid_argument("Invalid OpenFst model");
    }
  }

  Lattice* CreateLattice(const std::string& input) const {
    return new Lattice(Compose(input));
  }

  val Trace(const std::string& input, const std::string& output,
            bool constrain_output) const {
    Fst lattice = Compose(input);
    if (constrain_output) {
      Fst constrained;
      fst::Compose(lattice, Compile(output), &constrained);
      lattice = std::move(constrained);
    }
    Fst path;
    fst::ShortestPath(lattice, &path, 1, true);
    Check(path);
    if (path.Start() == fst::kNoStateId) {
      throw std::runtime_error("no WFST path for the requested input");
    }
    std::string text;
    if (!fst::StringPrinter<Arc>(fst::TokenType::BYTE)(path, &text)) {
      throw std::runtime_error("Cannot decode WFST output");
    }
    val arcs = val::array();
    std::unordered_set<Arc::StateId> visited;
    auto state = path.Start();
    while (visited.insert(state).second) {
      const auto count = path.NumArcs(state);
      if (count == 0) {
        val result = val::object();
        result.set("text", text);
        result.set("arcs", arcs);
        return result;
      }
      if (count != 1) throw std::runtime_error("shortest WFST path is not linear");
      const auto& arc = fst::ArcIterator<Fst>(path, state).Value();
      arcs.call<void>("push", arc.ilabel);
      arcs.call<void>("push", arc.olabel);
      state = arc.nextstate;
    }
    throw std::runtime_error("shortest WFST path contains a cycle");
  }

 private:
  Fst Compose(const std::string& text) const {
    Fst lattice;
    fst::Compose(Compile(text), *graph_, &lattice);
    Check(lattice);
    return lattice;
  }

  std::unique_ptr<Fst> graph_;
};
}  // namespace

EMSCRIPTEN_BINDINGS(wetext) {
  FST_FLAGS_fst_error_fatal = false;
  emscripten::class_<Lattice>("Lattice").function("paths", &Lattice::Paths);
  emscripten::class_<Graph>("Graph")
      .constructor<const std::string&>()
      .function("lattice", &Graph::CreateLattice,
                emscripten::return_value_policy::take_ownership())
      .function("trace", &Graph::Trace);
}
