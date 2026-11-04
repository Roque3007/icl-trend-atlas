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
  `Decoder-only model` or `Encoder-decoder model`. A product name alone does
  not establish a structural architecture; unresolved cases are marked
  `Architecture not established`.
- `modelParameterMillions` records a numeric count either stated in the model
  label (for example `7B`) or matched to an unambiguous public checkpoint name.
- `modelParameterSource` separates `explicit_model_label` from
  `matched_public_checkpoint`; a matched count is approximate and linked to
  `modelParameterSourceUrl` and `modelParameterReferenceModel`.
- `modelParameterGroup` places known counts into fixed ranges for analysis.
  Ambiguous, proprietary, and composite model sizes remain `Not reported`.

The raw fields remain available in every trajectory. A new family should be
added only when the source data supports a stable, mutually exclusive mapping.
Composite systems are kept under `Composite pipeline` because assigning them
to one component family would misrepresent the tested system. They do not
receive a single parameter count because one component's size would not
describe the complete pipeline.

Checkpoint matching does not prove that the authors used an unchanged copy of
the reference checkpoint. The approximate size describes the named backbone,
not extra task-specific layers. Counts for closed models are not guessed.

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

Timing outcomes (inference time and latency) remain in the source workbook
but are excluded from the Atlas performance trajectories. They measure
resource cost rather than task quality. Benchmark-wide averages remain marked
`Suite-level` and should not be interpreted as evidence for an individual task.

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
explicit-only parameter extraction and fixed parameter-scale ranges. Version 5
adds source-linked public checkpoint matching, marks unestablished architecture
as such, and removes resource-cost curves from performance analyses.
Version 6 distinguishes aspect-sentiment tuple extraction from sentiment
classification, maps lexical simplification to word-level rewriting, and
recognizes hyperpartisan news detection as classification. These rules follow
the output structure stated by the newly source-verified papers.
Version 7 maps event argument extraction to structured extraction: the output
contains argument spans and role labels, not unconstrained text.
Version 8 separates image-input and text-input arousal-rating prediction in
iNews. Both produce an ordinal rating; input modality comes from the fixed
dataset condition, not from the task name alone.
