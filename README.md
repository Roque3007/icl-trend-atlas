# ICL Atlas

An interactive explorer for shot-count trajectories extracted from in-context learning papers. It supports task, model-family, metric, and monotonicity analyses, then drills from an aggregate result into papers, trajectories, individual shot results, and source tables.

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` to verify a production build.

## GitHub Pages

The repository includes a separate static build that reuses the same React interface and `atlas.json` data:

```bash
npm run build:pages
```

Pushing to `main` triggers `.github/workflows/pages.yml`, which publishes `pages-dist` to GitHub Pages. No workbook data is duplicated; refreshing `app/data/atlas.json` updates both deployment targets.

## Refresh the data

The site reads `app/data/atlas.json`, which is generated from the master extraction workbook. After adding or correcting papers in the workbook, run:

```bash
npm run data:import -- \
  "/absolute/path/to/icl-master-extraction-monotonicity-analysis.xlsx" \
  --output app/data/atlas.json
```

The importer reads the `Trajectories`, `All Results`, and `Statistical Tests` sheets. It retains raw scores, direction-normalized analysis scores, source-table URLs, evidence tiers, and statistical-test records. Run `npm run build` after every refresh.

Python needs `openpyxl`:

```bash
python3 -m pip install openpyxl
```

To regenerate the manual-review queue from the workbook and the 355-paper
candidate list, run:

```bash
npm run data:review-queue
```

The queue preserves existing paper decisions. It prioritizes uncertain records
by the evidence problem that requires review, followed by candidates that have
not yet received a paper-level decision.

## Data interpretation

- `normalized` chart mode reverses lower-is-better metrics so upward always means improvement.
- The cross-category matrix averages trajectories within each paper before comparing papers, preventing papers with many extracted rows from dominating a cell.
- Architecture is analyzed separately from model family. Parameter counts are either explicit in the extracted label or approximately matched to a named public checkpoint, with the source linked in trajectory details; ambiguous and undisclosed sizes remain unknown.
- Inference-time and latency rows remain in the workbook but are outside the site's task-performance analysis. Suite-level benchmark averages remain distinct from individual tasks.
- Two-point records describe endpoint direction but do not establish a curved trajectory.
- Statistical support is shown only when reported test output is available.
- Source links remain attached to each trajectory for verification.

The canonical model and task fields, aggregation thresholds, and taxonomy
versioning policy are documented in [docs/data-taxonomy.md](docs/data-taxonomy.md).
