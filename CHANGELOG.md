# Changelog

## 2026-10-18

### Model and task normalization

- Replaced raw model-type grouping with canonical model families while keeping
  every reported model label in the data.
- Added a separate model-architecture field so architecture and vendor family
  no longer appear as competing categories.
- Expanded the task taxonomy to cover all currently extracted trajectories;
  no known task now falls into the generic `Other` operation.
- Added taxonomy version 3 to the generated dataset for reproducibility.

### Cross-category analysis

- Added a matrix that compares input-output pairs or task operations with model
  families.
- Weighted the matrix at the paper level so papers with many extracted rows do
  not dominate the aggregate.
- Marked cells with fewer than three papers as insufficient evidence and linked
  every populated cell back to its source trajectories.

### Reason for the change

The previous interface exposed overlapping labels such as `LLM`,
`decoder-only LLM`, and named model families in the same grouping. This made
model comparisons difficult to interpret. The revised dimensions support the
research question directly: for a task or input-output pair and a model family,
do additional in-context examples tend to improve the reported result?

### Manual-review queue

- Added a reproducible CSV export containing the 101 uncertain decisions and
  127 candidates not yet reviewed.
- Classified each uncertain paper by its evidence gap and supplied a specific
  next action without changing the existing inclusion decision.
- Added blank reviewer fields so later decisions, evidence locations, and
  verification dates can be recorded explicitly.
