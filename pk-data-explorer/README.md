# PK Data Explorer (Version 1)

Browser-only **concentration–time plotting and descriptive statistics** for preclinical PK/TK and tissue-distribution datasets. Hosted as a separate folder of `PK_simulator`; it does **not** modify the simulator. Uploaded study files remain in the browser and are never sent to GitHub or the application server.

## Open the site

- Hosted: `https://mengbyang.github.io/PK_simulator/pk-data-explorer/` (after GitHub Pages serves this folder).
- Locally: run `python3 -m http.server 8000` in the repository root and open `http://localhost:8000/pk-data-explorer/`.
- For local development in this folder, run `python3 -m http.server 8000` and open `http://localhost:8000/`.

Uses Plotly 2.35.2 and SheetJS 0.18.5 via CDNs. A network connection is required to initially load those libraries. No backend, account, or data upload is needed. JavaScript runs entirely in your browser.

## Input

One row per analytical observation; headers in first row. CSV, TXT (comma-separated), XLSX or XLS supported. Excel files may contain multiple worksheets. Select the worksheet, time column, concentration column and (optionally) animal ID after import. Other input columns remain available as grouping/filtering variables. A **synthetic example** is included; no actual study data is committed.

Example:

```csv
Animal_ID,Analyte,Sample Type,Group,Sampling time (h),Concentration (ng/g)
M001,Compound A,Liver,IV,0.25,123
M002,Compound A,Liver,IV,0.25,111
M003,Compound A,Liver,IV,0.25,0
M004,Compound A,Liver,IV,0.5,70
```

Numeric values including **zero** and negative numbers are included in descriptive statistics. Blank or nonnumeric entries (`BLQ`, `NA`, `-`, etc.) are treated as missing. Timepoints with nonnumeric times cannot be grouped. There is no BLQ substitution or NCA. For a log plot, zero/negative results are omitted from the figure, but remain in the statistics.

## Calculations

- Arithmetic mean, sample standard deviation (`n−1`), CV% (`SD / mean * 100`), and n (number of included numeric observations).
- For n=0, mean/SD/CV=`NA`; for n=1, SD/CV=`NA`; when mean=0, CV=`NA` (SD remains calculable for n>=2).
- Calculations use full precision; only presentation/summary exports are rounded according to the chosen **significant digits** (1–12) and **decimal versus scientific notation**.
- Time and concentration are not transformed during calculations, and sample count is record count, not unique animal count. Technical replicates therefore count as separate records. Blank or nonnumeric concentration inputs are excluded from n.

## Figures

- Configurable plot panels (row metadata and column metadata), curves (any combination of grouping variables), per-animal points/profiles, means, mean ± SD, and mean + individual points.
- Connecting line segments are straight, with **no curve fitting or smoothing**.
- Log10 or linear Y-axis. SVG and 2×-scale PNG figure export (including all panels).
- For sparse terminal-sampling designs, choose **replicate position** table rows; for serial designs, choose **animal ID** rows. Replicate position across timepoints does **not** imply the same animal.

## Downloads

- **Figure**: PNG and SVG.
- **Wide summary**: CSV. Grouping variables appear in rows; sampling times across columns; individual rows, n, mean, SD and CV%.
- **Plot data**: CSV, unrounded long-format means, SD, CV% and n.
- **Excel workbook**: wide summary formatted to significant digits, full-precision statistics, selected input data, and analysis settings.

## Tests

Run `node test-core.cjs` in this folder. This test uses the locally supplied `Anima.txt` test dataset when available; the actual study dataset is **never included in GitHub**. For a public clone without that file, set `PK_TEST_INPUT` to a local data path, or use only the built-in synthetic file for UI smoke tests.

## Constraints

- Report statistics are **descriptive**, not NCA parameters.
- For very large data files, wide summary rendering and high-panel-count plots may be slower; the app limits a single plotting view to 48 panels.
- For a group/time with multiple samples for one animal, the animal-layout cell lists all observed values, while group n counts all numeric records.
- This research tool is not independently validated for GxP submission. Review exported statistics against source data before regulated reporting.