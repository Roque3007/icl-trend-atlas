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

The site reads `app/data/atlas.json`, generated from `public/icl-master-extraction.xlsx`. This public workbook is a verified-only export; the larger staged workbook remains outside the repository. After promoting source-table-verified rows, rebuild the verified-only export from the research directory with `node work/master-workbook/build_master.mjs "$PWD" "$PWD/icl-trend-atlas/public/icl-master-extraction.xlsx" --verified-only`, then run:

```bash
npm run data:import -- \
  public/icl-master-extraction.xlsx \
  --output app/data/atlas.json
```

The importer rejects any trajectory or result that is not marked `source_table_verified`. It retains raw scores, direction-normalized analysis scores, source-table URLs, evidence tiers, and statistical-test records. Run `npm run build:pages` and `npm test` after every refresh. A verified table score is descriptive evidence; it is not a statistically significant finding unless the paper reports a supporting test.

Python needs `openpyxl`:

```bash
python3 -m pip install openpyxl
```

To regenerate a manual-review queue, supply the current *staged* workbook,
not the verified-only public download, so provisional decisions are preserved:

```bash
npm run data:review-queue -- \
  ../overnight_icl_2026-11-04/icl-master-extraction-expanded-2026-11-04.xlsx \
  ../acl_multishot_high_precision.csv \
  --output /path/outside-the-public-site/manual-review-queue.csv
```

The queue preserves existing paper decisions. It prioritizes uncertain records
by the evidence problem that requires review, followed by candidates that have
not yet received a paper-level decision. Do not publish this provisional queue.

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
