# Data taxonomy and comparison method

This document records the grouping rules used by ICL Atlas. The purpose is to
make aggregate views comparable without discarding the terminology reported by
each paper.

## Model fields

The source papers use `model_type` for several different concepts: a named
model family, an architecture, a prompting method, or a complete processing
pipeline. ICL Atlas separates these concepts instead of presenting them as
competing categories.

- `modelName` is the model name reported in the extracted record.
- `modelTypeRaw` is the original extracted model-type label.
- `modelFamily` is the canonical family used for aggregation, such as
  `OpenAI GPT`, `Meta Llama`, or `T5 / FLAN`.
- `modelArchitecture` is an independent structural category, such as
  `Decoder-only model` or `Encoder-decoder model`.
- `modelParameterMillions` records a numeric parameter count only when the
  extracted model label explicitly states one, such as `7B` or `600M`.
- `modelParameterGroup` places explicit counts into fixed ranges for analysis.
  Missing values remain `Not reported` rather than being inferred from aliases.

The raw fields remain available in every trajectory. A new family should be
added only when the source data supports a stable, mutually exclusive mapping.
Composite systems are kept under `Composite pipeline` because assigning them
to one component family would misrepresent the tested system. They do not
receive a single parameter count because one component's size would not
describe the complete pipeline.

## Task fields

Task labels are represented at several levels so that the same data can answer
both broad and specific questions.

- `task` preserves the extracted task name.
- `inputType` and `outputType` describe the observable task interface.
- `semanticOperation` describes the transformation applied to the input.
- `taskSubtype` preserves a more specific research-task grouping.
- `semanticScope` describes whether the task is local, relational,
  context-grounded, instance-level, or compositional.

These dimensions are deliberately separate. For example, classification and
question answering can both produce short labels or answers, but they perform
different semantic operations.

## Cross-category evidence matrix

The matrix compares either input-output pairs or semantic operations with
canonical model families. Each trajectory contributes its endpoint direction:
whether the final tested shot count is better than the initial tested shot
count after metric-direction normalization.

To prevent one paper with many metrics or model variants from dominating a
cell, trajectory outcomes are averaged within each paper first. The displayed
percentage is then the mean of those paper-level values.

- `Aided`: at least two thirds of paper-level outcomes improve.
- `Mixed`: between one third and two thirds improve.
- `Harmed`: at most one third improve.
- `Insufficient`: fewer than three distinct papers are represented.

These labels are descriptive. They do not establish statistical significance,
causality, or performance comparability across different metrics. Each cell
links back to the underlying trajectories and source-table references.

## Versioning

The importer writes `taxonomyVersion` to `atlas.json`. Increment this value
whenever a grouping rule changes so exported analyses can identify which
taxonomy produced their categories. Taxonomy version 3 introduced the model
family/architecture separation and expanded task coverage. Version 4 added
explicit-only parameter extraction and fixed parameter-scale ranges.
