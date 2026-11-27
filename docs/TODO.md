# TODO

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
