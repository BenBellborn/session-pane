## Task: 🔴 [New] Show a changed file's diff side by side when the pane is wide
- **Goal:** wide pane shows old and new lines next to each other, so a change reads at a glance; narrow pane keeps unified diff.
- **Current:** no git-delta anywhere: not on PATH, no `core.pager`/`pager.*`/`interactive.diffFilter` in git config, no
  delta in PowerShell profiles, none in `hooks/`.
- **Current:** pane cannot draw delta output: `CodeProps.source` and Text take tab and newline as only control characters
  (`.claude-plugin/types/claude-code/index.d.ts:2036`); ANSI SGR is drawn only in `AgentRow.body`.
- **Current:** `hooks/press.ts` `diffShow` → `fileDiff` runs `git diff HEAD -- <path>` (`--no-index` for untracked), keeps text
  from first `@@` hunk, stores `Output { format: 'diff', source, path }`.
- **Current:** `hooks/register.tsx:170` draws it as `<Code format="diff" path wrap="truncate-end">`: unified only; `CodeProps`
  has no side-by-side mode.
- **Current:** drop delta; plugin builds side-by-side rows itself from unified hunks in `Output.source`.
- **Current:** side-by-side when `e.props.bodyColumns >= 160` and source holds at least one `@@ -a,b +c,d @@` hunk;
  else today's `<Code format="diff">` (binary, "No difference.", narrow pane). Cutoff a named const `SIDE_BY_SIDE_COLUMNS`.
- **Current:** new file `hooks/diff.ts`, pure `diffSides(source: string): DiffRow[]`, no engine import.
- **Current:** `DiffRow`: `{ kind: 'hunk'; text: string }` or `{ kind: 'pair'; left: DiffHalf | null; right: DiffHalf | null }`.
- **Current:** `DiffHalf`: `{ line: number; text: string; change: 'same' | 'removed' | 'added' }`.
- **Current:** Hunk header `@@` → `hunk` row (its text as is); line numbers start at `a` (left) and `c` (right).
- **Current:** ` ` line → pair, same text both sides, both numbers step.
- **Current:** Run of `-` lines then run of `+` lines → paired row by row; shorter side `null` (blank half).
- **Current:** `-` run with no `+` after, or lone `+` run → other side `null`.
- **Current:** `\ No newline at end of file`, `---`/`+++`, `diff --git`, `index`, `new file mode` lines skipped.
- **Current:** `hooks/register.tsx` `draw` case `'output'`: diff + wide → `<Box flexDirection="column">` of one Text row
  per `DiffRow`.
- **Current:** `hunk` row: `<Text color="inactive" wrap="truncate-end">`.
- **Current:** `pair` row: left half, `│` in `inactive`, right half. Half width `Math.floor((bodyColumns - 1) / 2)`.
- **Current:** Half: line number right-aligned to digit count of the hunk set's highest number, space, marker (` `/`-`/`+`), text cut by
    `widthCut`, padded with `padEnd` to half width; `null` half: spaces.
- **Current:** `removed` half `backgroundColor="diffRemoved"`, `added` half `backgroundColor="diffAdded"`, `same` half no color
    (theme keys only, file `// rule:`). No syntax color in side-by-side; unified view keeps it.
- **Current:** red test in `session-pane.test.tsx`: pane test helper (line ~139, `bodyColumns: 10` fixed) takes optional
  columns; press `Changed:src/a.py` with `DIFF` at 160 columns → no `Code` element; Text rows hold `1 -old` and `1 +new` on one
  row, `2  same` both sides.
- **Current:** unit tests for `diffSides`: context pair, `-`/`+` run of unequal length, lone `+` run (new file), two
  hunks, `\ No newline` skipped.
- **Current:** keep existing diff tests green at 10 columns (unified `Code` path unchanged).
- **Restrictions:** no new git call, no ANSI, no delta dependency; `hooks/press.ts` and `Output` type unchanged; colors theme keys
  only; uncommitted edits in `hooks/register.tsx` and `session-pane.test.tsx` at plan time stay.
- **Target Files:** `hooks/diff.ts` (new), `hooks/register.tsx`, `session-pane.test.tsx`.
- **Done Criteria:** `claude plugin test` green, new side-by-side tests included; `tsc` clean; pane at >= 160 columns shows a
  diff side by side, narrow pane unified (unverified look: Ben checks once).

## Task: 🔴 [New] Show the session's local path at the top of the pane; a press opens it in File Explorer
- **Goal:** Ben sees which folder the session works in at a glance, and reaches it in Explorer with one press.
- **Current:** `hooks/register.tsx` `session.start` stores `projectRoot` (`CLAUDE_PROJECT_DIR` or `e.cwd`) in `SessionView`; the
  pane draws no path line. `paneRows` builds Permissions, Changed, Agents, Tasks parts via `part()`; all empty → one row
  `Nothing to show.`.
- **Current:** `hooks/press.ts` `ItemKind` is `changedFile | task | permission | agent`; `DEFAULT_ACTIONS` per kind;
  `{ run: [...] }` starts a program via `programStart`, failure opens section `Could not start <argv0>` under the pressed item's
  part (`part()` matches `opened.key` prefix `<partName>:`).
- **Current:** `register.tsx` `widthCut` cuts right end with `…`; `pressableLine` pads selected line to `bodyColumns`.
- **Current:** each part has a `show<Part>` boolean in `.claude-plugin/plugin.json` `userConfig`, read by `settingsRead`.
- **Current:** test helper `paneParts` drops rows before the first header; `paneTexts` returns every row. Tests at
  `session-pane.test.tsx` ~208 (`['Nothing to show.']`) and ~491 (`texts.slice(0, 4)`) expect the first row to be a part.
- **Current:** red tests in `session-pane.test.tsx` (mock `CLAUDE_PROJECT_DIR` is `C:/proj`): first pane row is
  `C:\proj`; at 5 columns it is `…proj`; press on it runs `explorer.exe C:\proj` with cwd `C:/proj`; option `showPath: false`
  → no path row. `paneMount` takes optional columns (default `PANE_COLUMNS`).
- **Current:** path shown is `projectRoot` (the folder every other part reads from), not the cwd after a `cd`.
- **Current:** shown and `{path}` value in Windows form (`/` → `\`) only when `projectRoot` starts with a drive letter
  (`C:`); else as is.
- **Current:** `register.tsx` `widthCutLeft(text, width)` beside `widthCut`: too long → `…` plus the last `width - 1`
  chars (char cut, not segment cut).
- **Current:** `press.ts` `ItemKind` gains `path`; `DEFAULT_ACTIONS.path = { run: ['explorer.exe', '{path}'] }`,
  configurable in `onPress` like the others. Item: key `Path:<projectRoot>`, label `path`, values `{ text, path, root }`,
  cwd `projectRoot`.
- **Current:** `Row` kind `path` drawn as pressable `Text wrap="truncate-end"`, no color (plain-line rule), text
  `widthCutLeft` to `bodyColumns`, padded when selected. First row of the pane, no part header.
- **Current:** `paneRows`: path row (when `showPath` and `projectRoot` not empty), then its section when `opened.key`
  starts with `Path:`, then the parts; `Nothing to show.` still shows under the path row when every part is empty.
- **Current:** `plugin.json` `userConfig.showPath` boolean, title `Show project path`, default true; `Settings.showPath`
  read in `settingsRead`; `sync` stores `projectRoot` as today, `paneRows` gets the flag.
- **Current:** existing tests whose expected list starts at the first row (`Nothing to show.`, `slice(0, 4)`) take the
  path row first.
- **Restrictions:** no new git call; `Output` type unchanged; colors theme keys only; uncommitted edits in
  `hooks/register.tsx` and `session-pane.test.tsx` at plan time stay.
- **Target Files:** `hooks/press.ts`, `hooks/register.tsx`, `session-pane.test.tsx`, `.claude-plugin/plugin.json`.
- **Done Criteria:** `claude plugin test` green, new path tests included; `tsc` clean.

## Task: 🟡 [Bug] Cut and pad each side-by-side diff half by terminal cell width, so wide characters keep the right half inside the pane
- **Goal:** a changed line with CJK text or emoji keeps the `│` and the new side visible in the wide diff view.
- **Current:** `hooks/register.tsx` `halfText` (~line 229) cuts with `widthCut` and pads with `padEnd`; both count `String.length`
  (UTF-16 code units), not terminal cells. A CJK character draws 2 cells and counts 1.
- **Case:** pane 160 columns (half 79 cells), diff `-a` / `+` 60 CJK characters → half counted 60, drawn ~120 cells; `│` and right
  half pass the pane edge and `wrap="truncate-end"` cuts the new side off.
- **Unsolved:** how to count cell width with no new dependency?
  - **Recommended:** small pure `cellWidth`/`cellCut` helper in `hooks/diff.ts` (wide East Asian ranges and surrogate-pair emoji
    count 2, combining marks 0); `halfText` cuts and pads with it. Agent and permission lines keep `widthCut`.
- **Target Files:** `hooks/diff.ts`, `hooks/register.tsx`, `session-pane.test.tsx`.
- **Done Criteria:** test at `bodyColumns: 160` with a 60-CJK-character `+` line: drawn row width at most 160 cells, right half text
  present; `bash ~/.claude/scripts/plugin-test.sh` and `tsc -p .` green.
