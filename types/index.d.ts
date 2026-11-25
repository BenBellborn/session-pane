// What the pane shows, top to bottom: changed files, running agents, tasks. A part the options hide stays empty.
export type SessionView = {
  // The project folder: where task files, commands and {root} start.
  projectRoot: string
  // Files `git status` lists as changed or untracked; empty outside a git repo.
  changed: ChangedFile[]
  // Repo folder the changed paths start at; absent outside a git repo.
  repoRoot?: string
  // One line per running agent, then one per background task.
  agents: AgentLine[]
  // The open tasks, in the order the pane shows them.
  lines: TaskLine[]
  // The task file the lines come from, from the project folder; absent when none was found.
  taskFile?: string
  // The run whose filter file picks the lines ('plan', 'fix'); absent: no filter, every task shows.
  mode?: string
  // Shown in place of the task lines: a bad task pattern.
  note?: string
}

// One open task. `text`: "<id padded to 5>: <title>", or the title alone when the format gives no id. `line`: 1-based, in the task file.
export type TaskLine = { text: string; id?: string; line: number }

// One Agents line: an agent, "<lead><family>:<effort>:<rest>" ("└ Opus:medium:Explore - name"), or a background task,
// "<task> - <rest>" ("shell - Run tests"). `lead`: '' or a sub agent's indent and "└ ". `effort`: absent when the agent takes
// the session's. `rest`: agent type and name, or the task's description.
export type AgentLine = { lead: string; family?: string; effort?: string; task?: TaskKind; rest: string }

// The tool kind of a background task: a Bash or PowerShell command, a Monitor, a Workflow.
export type TaskKind = 'shell' | 'monitor' | 'workflow'

// A background task still running. `title`: its description on one line.
export type BackgroundTask = { kind: TaskKind; title: string }

// A file `git status` lists; path from the repo root, '/' separated.
export type ChangedFile = { path: string; isUntracked: boolean }

// The section a press opened under its part: a diff, or a command's output. `key`: the pressed item's selection key.
// `path`: the file a diff colors its code as.
export type Output = { key: string; title: string; source: string; format: 'diff' | 'text'; path?: string }

// Background tasks still running, by task id.
export type BackgroundTasks = Record<string, BackgroundTask>

// Calls auto mode denied and no later call allowed, call key (agent, tool, input) to pane line ("Bash: git push").
export type OpenPermissions = Record<string, string>

declare module 'claude-code' {
  interface PluginState {
    'session-pane': {
      view: Shaped<SessionView>
      tasks: Shaped<BackgroundTasks>
      permissions: Shaped<OpenPermissions>
      output: Shaped<Output | null>
      selection: Shaped<string | null>
    }
  }
}
