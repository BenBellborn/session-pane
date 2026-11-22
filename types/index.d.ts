// What the pane shows, top to bottom: changed files, running agents, tasks. A part the options hide stays empty.
export type SessionView = {
  // Files `git status` lists as changed or untracked; empty outside a git repo.
  changed: ChangedFile[]
  // Repo folder the changed paths start at; absent outside a git repo.
  repoRoot?: string
  // One line per running agent ("Opus:Explore - name"; a sub agent indented, "└ " first), then one per background task.
  agents: string[]
  // One line per open task: "<id padded to 5>: <title>", or the title alone when the format gives no id.
  lines: string[]
  // The run whose filter file picks the lines ('plan', 'fix'); absent: no filter, every task shows.
  mode?: string
  // Shown in place of the task lines: a bad task pattern.
  note?: string
}

// A file `git status` lists; path from the repo root, '/' separated.
export type ChangedFile = { path: string; isUntracked: boolean }

// The diff shown under the changed files after a press on a file's name; null: none open.
// `source`: the diff from its first hunk on, drawn by Code; git's text when it has no hunk.
export type FileDiff = { path: string; source: string }

// Background tasks still running, task id to pane line ("shell - Run tests").
export type BackgroundTasks = Record<string, string>

// Calls auto mode denied and no later call allowed, call key (agent, tool, input) to pane line ("Bash: git push").
export type OpenPermissions = Record<string, string>

declare module 'claude-code' {
  interface PluginState {
    'session-pane': {
      view: Shaped<SessionView>
      tasks: Shaped<BackgroundTasks>
      permissions: Shaped<OpenPermissions>
      diff: Shaped<FileDiff | null>
      selection: Shaped<string | null>
    }
  }
}
