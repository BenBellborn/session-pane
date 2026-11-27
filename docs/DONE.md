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
