# TODO

## Task 2:  🔴 [Planned] [New] Show the session's local path at the top of the pane; a press opens it in File Explorer
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
- **New (assumed):** red tests in `session-pane.test.tsx` (mock `CLAUDE_PROJECT_DIR` is `C:/proj`): first pane row is
  `C:\proj`; at 5 columns it is `…proj`; press on it runs `explorer.exe C:\proj` with cwd `C:/proj`; option `showPath: false`
  → no path row. `paneMount` takes optional columns (default `PANE_COLUMNS`).
- **New (assumed):** path shown is `projectRoot` (the folder every other part reads from), not the cwd after a `cd`.
- **New (assumed):** shown and `{path}` value in Windows form (`/` → `\`) only when `projectRoot` starts with a drive letter
  (`C:`); else as is.
- **New (assumed):** `register.tsx` `widthCutLeft(text, width)` beside `widthCut`: too long → `…` plus the last `width - 1`
  chars (char cut, not segment cut).
- **New (assumed):** `press.ts` `ItemKind` gains `path`; `DEFAULT_ACTIONS.path = { run: ['explorer.exe', '{path}'] }`,
  configurable in `onPress` like the others. Item: key `Path:<projectRoot>`, label `path`, values `{ text, path, root }`,
  cwd `projectRoot`.
- **New (assumed):** `Row` kind `path` drawn as pressable `Text wrap="truncate-end"`, no color (plain-line rule), text
  `widthCutLeft` to `bodyColumns`, padded when selected. First row of the pane, no part header.
- **New (assumed):** `paneRows`: path row (when `showPath` and `projectRoot` not empty), then its section when `opened.key`
  starts with `Path:`, then the parts; `Nothing to show.` still shows under the path row when every part is empty.
- **New (assumed):** `plugin.json` `userConfig.showPath` boolean, title `Show project path`, default true; `Settings.showPath`
  read in `settingsRead`; `sync` stores `projectRoot` as today, `paneRows` gets the flag.
- **New (assumed):** existing tests whose expected list starts at the first row (`Nothing to show.`, `slice(0, 4)`) take the
  path row first.
- **Restrictions:** no new git call; `Output` type unchanged; colors theme keys only; uncommitted edits in
  `hooks/register.tsx` and `session-pane.test.tsx` at plan time stay.
- **Target Files:** `hooks/press.ts`, `hooks/register.tsx`, `session-pane.test.tsx`, `.claude-plugin/plugin.json`.
- **Done Criteria:** `claude plugin test` green, new path tests included; `tsc` clean.
