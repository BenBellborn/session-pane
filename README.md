# session-pane

A Claude Code pane beside the chat that shows what the session does now. It refreshes every 2 seconds.

| Part | Shows |
|---|---|
| Permissions | Calls auto mode denied. A line drops out when a later call of the same tool and input is allowed. |
| Changed | Files `git status` lists as changed or untracked, colored by file type. Press a name to see its diff against `HEAD`; press again to close it. The open file's name is highlighted. |
| Agents | Running agents as `<model>:<agent type> - <name>`, sub agents indented under their parent, then background shell, monitor and workflow tasks. |
| Tasks | Open tasks of the first task file found in the project. |

A part with nothing to show is hidden. Press a Permissions, Agents or Tasks line to highlight it; press it again to clear it. Open the pane with `/session-pane`. It also opens when an interactive session starts.

## Install

```
/plugin marketplace add BenBellborn/session-pane
/plugin install session-pane@session-pane
```

## Options

Set them in `/config`, or in `settings.json` under `pluginConfigs["session-pane@session-pane"].options`.

| Option | Default | Meaning |
|---|---|---|
| `taskFiles` | `TODO.md, docs/TODO.md` | Comma-separated paths from the project folder. The first file found fills the Tasks part. |
| `taskFormat` | `checkbox` | `checkbox`: each open `- [ ] text` line. `heading`: each `## Task <id>: <title>` line. `custom`: `taskPattern`. |
| `taskPattern` | empty | With `taskFormat` `custom`: a regex that one task line matches, with a named group `title` and an optional named group `id`. |
| `showPermissions` | `true` | Show the Permissions part. |
| `showChanged` | `true` | Show the Changed part. |
| `showAgents` | `true` | Show the Agents part. |
| `showTasks` | `true` | Show the Tasks part. |

Example of a custom pattern for `TODO(a1): Ship it` lines: `^TODO\((?<id>\w+)\): (?<title>.*)$`.

## Filter file

A tool can make the Tasks part show only some tasks, in its own order. It writes this file for the session:

```
<config dir>/cache/session-pane/<session id>.json
{"mode": "fix", "ids": ["46", "18"]}
```

- `<config dir>` is `CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`.
- `<session id>` is the `CLAUDE_CODE_SESSION_ID` environment variable of the session.
- `ids` are task ids, so the filter works only with a format that gives ids (`heading`, or a custom pattern with an `id` group).
- `mode` shows in the part's header: `Tasks (/fix)`.
- Delete the file to show every task again.
- Write a temporary file first, then rename it, so the pane never reads half a file.

## Test

From the repo folder: `claude plugin test`.

## License

MIT
