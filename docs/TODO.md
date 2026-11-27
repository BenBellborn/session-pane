# TODO

## Task 1:  🔴 [Refactor] Count side-by-side diff cell width per grapheme cluster, not per code point
- **Goal:** flags, skin-toned emoji, ZWJ and VS16 emoji keep the `│` column of the wide diff view in place.
- **Current:** `hooks/diff.ts` `pointCells` (~line 67) counts each code point: `TWO_CELLS` (East Asian wide or
  `\p{Emoji_Presentation}`) = 2, `\p{Mn}\p{Me}\p{Cf}` = 0, else 1. Commit dcf8f1b added it to fix `halfText` cutting by
  `String.length` (fix after review of af390a5); its review found a second fault of the same shape.
- **Current:** `\p{Emoji_Presentation}` matches regional indicators (U+1F1E6-1F1FF) and skin-tone modifiers (U+1F3FB-1F3FF)
  (node check: both true). VS16 text emoji count 1, ZWJ sequences count per part (accepted limits in dcf8f1b).
- **Case:** half 79 cells, line `-a🇩🇪` → flag counts 4, draws 2 → `cellPad` adds 2 spaces too few, `│` lands 2 cells left.
  `👍🏽` counts 4, draws 2.
- **Unsolved:** one width model for all clusters?
  - **Recommended:** split text with `Intl.Segmenter` (grapheme), width per cluster: 2 when the cluster holds a wide or emoji
    code point (VS16 included), else 1; 0-width cluster only when it is all `\p{Mn}\p{Me}\p{Cf}`. `cellCut` cuts on cluster
    boundaries.
- **Target Files:** `hooks/diff.ts`, `session-pane.test.tsx`.
- **Done Criteria:** tests: flag, skin-toned emoji, ZWJ family, `❤️`, CJK each count 2; `bash ~/.claude/scripts/plugin-test.sh`
  and `tsc -p .` green.

## Task 2:  🟡 [Ben] [Bug] [PLAUSIBLE: manual run of explorer.exe on a folder whose name holds a comma] Open a project folder whose path holds a comma in File Explorer
- **Goal:** a press on the path row opens the project folder for every folder name.
- **Current:** `hooks/press.ts:25` `DEFAULT_ACTIONS.path` is `{ run: ['explorer.exe', '{path}'] }`; the folder goes to Explorer
  unchanged. Explorer reads a comma in its argument as a switch separator (`/select,<path>`).
- **Case:** project folder `C:\src\a,b` → press runs `explorer.exe C:\src\a,b` → Explorer may open `C:\src\a` or Documents
  (unverified: Explorer was not run).
- **Unsolved:** fix if confirmed?
  - **Recommended:** default action `{ run: ['explorer.exe', '/root,{path}'] }`, or `/e,`; test checks the spawned args.
- **New:** Ben runs `explorer.exe "C:\<folder>\a,b"` once and says which folder opens.
- **Target Files:** `hooks/press.ts`, `session-pane.test.tsx`.
- **Done Criteria:** manual run opens `a,b`; `bash ~/.claude/scripts/plugin-test.sh` green.
