# ICL Atlas

An interactive explorer for shot-count trajectories extracted from in-context learning papers. It supports four entry points—task, model, metric, and monotonicity pattern—then drills from an aggregate trend into papers, trajectories, and individual shot results.

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` to verify a production build.

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

## Data interpretation

- `normalized` chart mode reverses lower-is-better metrics so upward always means improvement.
- Two-point records describe endpoint direction but do not establish a curved trajectory.
- Statistical support is shown only when reported test output is available.
- Source links remain attached to each trajectory for verification.
