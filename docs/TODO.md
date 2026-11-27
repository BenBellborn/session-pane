# TODO

## Task 1:  🟡 [Planned] [Bug] Cut and pad each side-by-side diff half by terminal cell width, so wide characters keep the right half inside the pane
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
