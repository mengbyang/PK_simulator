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


## Phase 2: Noncompartmental analysis (NCA)

Open the **NCA · Phase 2** results tab after uploading sample-level CSV/XLSX data. Do **not** upload a table of previously calculated PK parameters: input must contain observations, sampling times, and grouping metadata. NCA uses the same time/concentration column mappings, selected rows and summary grouping variables as the plots/statistics module.

### Workflows and parameters

- **Sparse sampling** (default): derive arithmetic mean concentration and sample standard error at each unique nominal time. Suitable for terminal tissue collection, with individual animal identifiers used for covariance in linear trapezoidal SE_AUC calculations.
- **Individual sampling**: estimate NCA per animal. A single observed concentration cannot form a longitudinal PK profile; it is not converted to a pseudo-profile by automatically adding zero at dose time.
- Includes the columns in the reference parameter table: `Rsq_adjusted`, `HL_Lambda_z`, `Span`, `Tmax`, `Cmax`, `SE_Cmax`, `Tlast`, `Clast`, `AUClast`, `SE_AUClast`, `AUCall`, `SE_AUCall`, `AUCINF_obs`, `AUC_%Extrap_obs`, `Vz_F_obs`, `Cl_F_obs`, `MRTlast`, `AUMClast`, `AUMCINF_obs`, `AUMC_%Extrap_obs`, and `MRTINF_obs`. Extra columns show Lambda_z, unadjusted R², start/end terminal time, number of terminal points, and diagnostics.
- Choose **linear trapezoidal**, **linear up/log down**, or **linear before Tmax/log after** AUC/AUMC integration. Sparse `SE_AUClast` and `SE_AUCall` are calculated only for linear trapezoidal integration. Linear AUMC follows the WinNonlin trapezoidal rule applied to `t×C`.
- Optional insertion of a concentration **zero at the dose time for extravascular** profiles when there is no observed dose-time sample. Never inserts an IV bolus C0. Non-numeric results are omitted; zero is included in arithmetic means and AUC, but never in log-linear terminal regression.
- `Cl_F_obs` and `Vz_F_obs` are computed only when requested with a valid dose; appropriate unit selection is required. A dose divided by **tissue** or **metabolite** exposure is *not* interpretable as systemic clearance/volume. These ratios are off by default.

### Automatic and manual terminal-fit rules

Phoenix-style automatic **Best Fit** enumerates all consecutive suffixes of 3 or more positive eligible terminal concentrations, with the fit ending at Tlast, and selects the largest adjusted R². If multiple candidates fall within 0.0001 of the global maximum, the one with more points is used. Only negative-slope fits are permitted. By default Cmax is excluded (the reference tissue example uses this rule); you can select **Auto IV bolus by route** or **IV bolus** to allow inclusion of Cmax. Regression uses unweighted least squares of natural log concentration against time.

Select a profile to inspect the observed concentration-time points and its terminal fit, compare candidate windows, manually choose >=3 positive points, or restore the automatic fit. Export a diagnostic figure and the full candidate-fit table. Warning rules for adjusted R² below 0.90, terminal span below 2 half-lives, and AUC extrapolation above 20% are **review alerts**, not automatic fit rejections or regulatory criteria.

**NCA limits:** current module targets single-dose discrete concentration profiles, not repeat-dose steady-state, infusion, urine interval, corrected C0 estimation for IV bolus, or automated BLQ imputation. Terminal fit requires scientific review. Data are processed in the browser and must be independently checked before use in regulated documentation.

### Export and testing

NCA results download as a precision-formatted CSV or an Excel workbook containing numeric results, all candidate terminal regressions, underlying profiles, and the analysis settings. Significant digits and scientific/decimal formatting follow the main Results settings. The manual terminal-fit selection is captured in exported results.

Run `node test-nca.cjs` for numerical and regression tests, or `node test-core.cjs` for the Phase 1 functions. The original uploaded example datasets are deliberately not included in the public repository.

References: [Certara Phoenix Lambda Z estimation](https://onlinehelp.certara.com/phoenix/8.6/Phoenix_UserDocs/NCA_Object/Lambda_Z_or_Slope_Estimation_settings.htm), [NCA parameter formulas](https://onlinehelp.certara.com/phoenix/8.4/Phoenix_UserDocs/NCA_Object/NCA_parameter_formulas.htm), [Sparse sampling](https://onlinehelp.certara.com/phoenix/8.4/Phoenix_UserDocs/NCA_Object/Sparse_sampling_calculation.htm).


## Version 2.1: Route-specific single-dose NCA

- **Actual sampling time** can be selected independently of nominal time used for Phase 1 group statistics. Important when nominal Hour=0 indicates a sample collected 0.05 h after dosing.
- A separate **dose and route by profile** table lists all NCA profiles (group or individual), reads numerical dose and route from available columns, and permits edits to either value. Different dose levels are automatically separated for NCA even if not selected in Phase 1 grouping.
- **IV bolus** uses C0 at dose time if an actual postdose observation is present. Otherwise log-linearly back-extrapolates C0 from the first two declining positive postdose points; if unsuitable, uses the first postdose concentration. The estimation method is recorded. Time-zero convention can be specified. AUC integrates from dose time when C0 is available. A synthetic C0 is never used for terminal fitting.
- **Extravascular single dose** may insert zero at dosing time; reports CL/F and Vz/F, but not Vss. IV bolus reports CL, Vz and Vss. IV infusion and multiple dosing are **not implemented**.
- Systemic CL/volume calculations require positive dose, a terminal λz, and parent drug concentration in plasma/blood with compatible units. For a dose in mg/kg and concentrations in ng/mL, clearance is L/h/kg and volume is L/kg. Unavailable parameters are NA. Tissue and metabolite profiles should not have systemic CL/volume enabled.
- Explicit NCA parameter units appear in the table and exported CSV header, with Excel Parameter Units and Dose and Route sheets.
- An optional selection panel chooses NCA parameter columns without recalculating NCA. CSV and Excel summary exports follow the same selection.
- Input values such as BLQ and **-prefixed numbers are nonnumeric and excluded, while numeric zero is retained.
- The NCA examples in the actual study dataset are **not included** in the public GitHub repository. Use independent validation before regulatory applications.
