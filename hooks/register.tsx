import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, RenderChildren, ThemeKey } from 'claude-code'

import type { BackgroundTasks, ChangedFile, OpenPermissions, Output, SessionView, TaskLine } from '../types'
import { configEnsure, itemPress } from './press'
import type { PressedItem } from './press'
import { attempt, configDirPath } from './shared'

const PANE = 'session-pane'
// Change the tag when SessionView's fields change: it declines what an earlier version stored.
const view = atom({ plugin: 'session-pane', key: 'view' } as const, { projectRoot: '', changed: [], agents: [], lines: [] }, { shape: 'view-2' })
// The section a press opened; null: none. It belongs to the selected item and closes when the selection moves.
// rule: the state scan reads atoms only as consts of the reading file; press.ts and register.tsx each declare these two.
const output = atom({ plugin: 'session-pane', key: 'output' } as const, null as Output | null, { shape: 'output-1' })
// The selection key of the one pressed item drawn highlighted ("Tasks:<line>", "Changed:<path>"); null: none.
const selection = atom({ plugin: 'session-pane', key: 'selection' } as const, null as string | null, { shape: 'selection-1' })
// Background tasks started in this session (shell, monitor, workflow), by task id. The engine lists none to a mod, so the
// mod notes each one its tool call starts and drops it at its end notice or its TaskStop.
const tasks = atom({ plugin: 'session-pane', key: 'tasks' } as const, {} as BackgroundTasks, { shape: 'tasks-1' })
// Calls auto mode denied, kept until /permissions retries them. A retry is a new call with a new tool_use_id,
// so a denial is matched on agent, tool and input.
const permissions = atom({ plugin: 'session-pane', key: 'permissions' } as const, {} as OpenPermissions, { shape: 'permissions-1' })
// A task's end notice: "<task-notification><task-id>b1</task-id>...<status>completed</status>...</task-notification>".
// One delivery can hold several.
const NOTICE = /<task-notification>([\s\S]*?)<\/task-notification>/g
const TASK_ID = /<task-id>([^<]+)<\/task-id>/
const TASK_END = /<status>(completed|failed|killed|stopped)<\/status>/
// One task line per format; a custom pattern takes the same named groups: 'title', and 'id' when the format numbers its tasks.
const TASK_FORMATS = {
  // "- [ ] Write the docs"; a checked "- [x]" line is done.
  checkbox: /^\s*[-*+] \[ \] +(?<title>.*?)\s*$/,
  // "## Task 132: 🔴 [Bug] Title". The colon and bold marks are optional, so a heading a bad edit left half-formatted still shows.
  heading: /^## Task:? *(?<id>[0-9][0-9.]*[a-z]?)\**:? *(?<title>.*?)\s*$/,
}
// rule: pane colors are theme keys only. Plain lines take no color: chat text's terminal color, not white 'text'.
// Lower-case extension to its color; any other file shows as plain text.
const EXTENSION_COLORS: Record<string, ThemeKey> = {
  cs: 'ide',
  csproj: 'planMode', sln: 'planMode', props: 'planMode', config: 'planMode', json: 'planMode', xml: 'planMode', yml: 'planMode', yaml: 'planMode', toml: 'planMode',
  py: 'warning',
  ts: 'autoAccept', tsx: 'autoAccept', js: 'autoAccept', jsx: 'autoAccept', mjs: 'autoAccept',
  md: 'permission', txt: 'permission',
  sh: 'bashBorder', ps1: 'bashBorder', bat: 'bashBorder', cmd: 'bashBorder',
  html: 'claude', css: 'claude', scss: 'claude', cshtml: 'claude', razor: 'claude',
  sql: 'success',
}

// The plugin's options as the pane uses them. `taskLine` is the note to show instead when the custom pattern is bad.
type Settings = {
  taskFiles: string[]
  taskLine: RegExp | string
  showPermissions: boolean
  showChanged: boolean
  showAgents: boolean
  showTasks: boolean
}

// A task as the filter arranges it: its pane line, its id when the format gives one, its line in the task file.
type FoundTask = TaskLine

// One changed file's name on the pane, pressable.
type FileButton = { path: string; name: string; item: PressedItem; isSelected: boolean }

// One pane row, top to bottom; the render hook draws each kind.
type Row =
  | { kind: 'header'; name: string }
  // A line with an item is pressable: a press selects it and runs its action, a second press clears it.
  | { kind: 'line'; text: string; color?: ThemeKey; item?: PressedItem; isSelected?: boolean }
  | { kind: 'changed'; files: FileButton[] }
  | { kind: 'output'; output: Output }

export const register: Register = (on, options) => {
  const settings = settingsRead(options)

  on('session.start', async ($, e, next) => {
    // A run with no screen (`claude -p`, an SDK host) has no pane to fill.
    if (!e.isInteractive) return next(e)
    // rule: read from the project folder; a `cd` moves the session's folder and e.cwd, not CLAUDE_PROJECT_DIR.
    const projectRoot = (await $.process.hookEnv()).CLAUDE_PROJECT_DIR ?? e.cwd
    const filterFolder = `${await configDirPath($)}/cache/session-pane`
    await configEnsure($).catch(() => undefined)
    await $.command.register({ name: 'session-pane', description: 'Show denied permissions, changed files, running agents and open tasks in a pane' })
    void openPane($).catch(() => undefined)
    // Git, the agents, the task file and the filter file change outside the mod, so all are read again every 2 s.
    // A tick that finds the last sync still running is skipped, so an older read never overwrites a newer one.
    let isSyncing = false
    const tick = async () => {
      if (isSyncing) return
      isSyncing = true
      await sync($, projectRoot, filterFolder, settings).finally(() => (isSyncing = false))
    }
    void tick()
    $.clock.every(2000, () => void tick())

    return next(e)
  })

  backgroundTasksWatch(on)

  // Fires before the dialog shows; a hook beneath that answered it settled the ask, so no dialog opens.
  if (settings.showPermissions) permissionsWatch(on)

  on('command.run', { command: 'session-pane' }, async $ => {
    await openPane($)

    return { text: 'Session pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const rows = paneRows(await read($, view), Object.values(await read($, permissions)), await read($, output), await read($, selection))
    const selectedShade = selectedShadeOf(await themeName($))
    // A pressable label; a selected one sits on the selection shade.
    const pressable = (item: PressedItem, isSelected: boolean | undefined, label: (style: object) => RenderChildren) => (
      <Button key={item.key} plain onPress={() => itemPress($, item)}>
        {label(isSelected ? { backgroundColor: selectedShade } : {})}
      </Button>
    )
    const fileButtons = (files: FileButton[]) =>
      files.flatMap((file, i) => [
        ...(i === 0 ? [] : [<Text color="inactive">, </Text>]),
        pressable(file.item, file.isSelected, style => <Text color={extensionColor(file.path)} {...style}>{file.name}</Text>),
      ])
    // Only a selected line is padded to the pane's width: the host inverts a Button's label under the pointer, so an unpadded label
    // keeps that inversion on its text.
    const pressableLine = (row: Extract<Row, { kind: 'line' }>, item: PressedItem) =>
      pressable(item, row.isSelected, style => <Text color={row.color} {...style} wrap="truncate-end">{row.isSelected ? row.text.padEnd(e.props.bodyColumns) : row.text}</Text>)
    // A part's header fills the pane's width: "── Agents ───────".
    const draw = (row: Row) => {
      switch (row.kind) {
        case 'header':
          return <Text color="inactive">{`── ${row.name} `.padEnd(Math.max(row.name.length + 4, e.props.bodyColumns), '─')}</Text>
        case 'line':
          return row.item ? pressableLine(row, row.item) : <Text color={row.color} wrap="truncate-end">{row.text}</Text>
        case 'changed':
          return <Box flexDirection="row" flexWrap="wrap">{fileButtons(row.files)}</Box>
        case 'output':
          return row.output.format === 'diff' ? <Code source={row.output.source} format="diff" path={row.output.path} wrap="truncate-end" /> : <Text>{row.output.source}</Text>
      }
    }

    // The pane scrolls with the arrow keys while focused, so every line is drawn.
    return <Box flexDirection="column">{rows.map(draw)}</Box>
  })
}

function settingsRead(options: PluginOptions): Settings {
  return {
    taskFiles: String(options.taskFiles ?? '').split(',').map(path => path.trim()).filter(path => path !== ''),
    taskLine: taskLinePattern(options),
    showPermissions: options.showPermissions !== false,
    showChanged: options.showChanged !== false,
    showAgents: options.showAgents !== false,
    showTasks: options.showTasks !== false,
  }
}

// rule: the custom pattern is user input; a bad one becomes the Tasks note, never a failed load.
function taskLinePattern(options: PluginOptions): RegExp | string {
  if (options.taskFormat !== 'custom') return options.taskFormat === 'heading' ? TASK_FORMATS.heading : TASK_FORMATS.checkbox
  const pattern = String(options.taskPattern ?? '')
  if (pattern === '') return 'Task format is custom, but the task pattern is empty.'
  const regex = attempt(() => new RegExp(pattern))

  return regex instanceof Error ? `Bad task pattern: ${regex.message}` : regex
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Session' })
}

async function sync($: EngineInterface, projectRoot: string, filterFolder: string, settings: Settings) {
  const next: SessionView = {
    projectRoot,
    ...(settings.showChanged ? await changedFiles($, projectRoot) : { changed: [] }),
    agents: settings.showAgents ? await runningAgents($) : [],
    ...(settings.showTasks ? await openTasks($, projectRoot, filterFolder, settings) : { lines: [] }),
  }
  const now = await read($, view)
  if (JSON.stringify(now) !== JSON.stringify(next)) await update($, view, () => next)
}

// Tracked changes and untracked files (each file of an untracked folder), in `git status` order; none outside a git repo.
async function changedFiles($: EngineInterface, projectRoot: string): Promise<Pick<SessionView, 'changed' | 'repoRoot'>> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: projectRoot }).catch(() => undefined)
  if (!top || top.exitCode !== 0) return { changed: [] }
  const repoRoot = top.stdout.trim()
  const status = await $.process.run(['git', 'status', '--porcelain', '-z', '--untracked-files=all'], { cwd: repoRoot }).catch(() => undefined)
  if (!status || status.exitCode !== 0) return { changed: [] }

  return { changed: statusParse(status.stdout), repoRoot }
}

// `git status --porcelain -z` output to its files.
function statusParse(stdout: string) {
  const changed: ChangedFile[] = []
  const fields = stdout.split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    if (field.length < 4) continue
    changed.push({ path: field.slice(3), isUntracked: field.startsWith('??') })
    // A rename or copy carries its old path as the next field.
    if (field[0] === 'R' || field[0] === 'C') i++
  }

  return changed
}

// One line per agent still working, "<model family>:<agent type> - <name or task>", each sub agent indented under the agent
// that started it; then one line per background task.
async function runningAgents($: EngineInterface) {
  const agents = (await $.agent.list().catch(() => [])).filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting')
  const ids = new Set(agents.map(a => a.id))
  const lines: string[] = []
  const add = (shown: typeof agents, depth: number) => {
    for (const a of shown) {
      lines.push(`${depth === 0 ? '' : `${'  '.repeat(depth - 1)}└ `}${modelFamily(a.model)}:${a.type} - ${a.name ?? a.description}`)
      add(agents.filter(b => b.parentId !== undefined && b.parentId === a.id), depth + 1)
    }
  }
  // An agent whose parent ended or is not listed shows at the top level.
  add(agents.filter(a => !a.parentId || !ids.has(a.parentId)), 0)

  return [...lines, ...Object.values(await read($, tasks))]
}

// 'claude-opus-5-5' gives 'Opus'; an id of another form shows as is.
function modelFamily(model: string | undefined) {
  const m = /claude-([a-z]+)/.exec(model ?? '')
  if (!m) return model ?? '?'

  return m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
}

// The task lines of the first task file found, arranged by the session's filter file.
async function openTasks($: EngineInterface, projectRoot: string, filterFolder: string, settings: Settings): Promise<Pick<SessionView, 'lines' | 'taskFile' | 'mode' | 'note'>> {
  if (typeof settings.taskLine === 'string') return { lines: [], note: settings.taskLine }
  const found = await firstTaskFileRead($, projectRoot, settings.taskFiles)
  if (found === undefined) return { lines: [] }

  return { ...arrange(taskLines(found.text, settings.taskLine), await filterRead($, filterFolder)), taskFile: found.path }
}

async function firstTaskFileRead($: EngineInterface, projectRoot: string, taskFiles: string[]) {
  for (const path of taskFiles) {
    const text = await $.fs.read(`${projectRoot}/${path}`).catch(() => undefined)
    if (text !== undefined) return { path, text }
  }

  return undefined
}

// Task key to task, in file order. A task with an id is keyed by it and shows it left-padded to 5 chars, so the titles
// line up; one without is keyed by its line number, which no filter names.
function taskLines(text: string, taskLine: RegExp) {
  const byKey = new Map<string, FoundTask>()
  text.split(/\r?\n/).forEach((line, i) => {
    const m = taskLine.exec(line)
    if (!m) return
    const id = m.groups?.id
    const title = (m.groups?.title ?? m[0]).replace(/\*\*/g, '')
    byKey.set(id ?? `#${i}`, { text: id ? `${id.padStart(5)}: ${title}` : title, id, line: i + 1 })
  })

  return byKey
}

// The filter file a tool writes for this session: {"mode": "<run name>", "ids": ["<task id>", ...]}.
async function filterRead($: EngineInterface, filterFolder: string) {
  const text = await $.fs.read(`${filterFolder}/${await $.session.id()}.json`).catch(() => undefined)
  if (text === undefined) return undefined
  const filter = attempt(() => JSON.parse(text) as { mode?: string; ids?: string[] })
  if (filter instanceof Error) return undefined

  return { mode: String(filter.mode ?? ''), ids: Array.isArray(filter.ids) ? filter.ids.map(String) : [] }
}

// With a filter, its tasks show in its order and a task gone from the file drops out; without one, every task shows in file order.
function arrange(byKey: Map<string, FoundTask>, filter: { mode: string; ids: string[] } | undefined): Pick<SessionView, 'lines' | 'mode'> {
  if (!filter) return { lines: [...byKey.values()] }

  return { lines: filter.ids.flatMap(id => byKey.get(id) ?? []), mode: filter.mode }
}

// Background tasks: each tool call that starts one notes it; its TaskStop or end notice drops it.
function backgroundTasksWatch(on: Parameters<Register>[0]) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result && !ran.isError && ran.result.backgroundTaskId) await taskAdd($, ran.result.backgroundTaskId, `shell - ${e.description ?? e.command}`)

    return ran
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result && !ran.isError && ran.result.backgroundTaskId) await taskAdd($, ran.result.backgroundTaskId, `shell - ${e.description ?? e.command}`)

    return ran
  })

  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result && !ran.isError) await taskAdd($, ran.result.taskId, `monitor - ${e.description}`)

    return ran
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result && !ran.isError) await taskAdd($, ran.result.taskId, `workflow - ${ran.result.workflowName ?? e.name ?? 'script'}`)

    return ran
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    const id = e.task_id ?? e.shell_id
    if (id && ran.result && !ran.isError) await taskDrop($, id)

    return ran
  })

  // A local task's end notice comes in as a prompt; a relayed one as a delivery.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') await taskEndsDrop($, e.text)

    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') await taskEndsDrop($, e.text)

    return next(e)
  })
}

async function taskAdd($: EngineInterface, id: string, label: string) {
  await update($, tasks, now => ({ ...now, [id]: label }))
}

// Drops each task the notice text says has ended.
async function taskEndsDrop($: EngineInterface, text: string) {
  for (const [, notice] of text.matchAll(NOTICE)) {
    const id = TASK_ID.exec(notice!)?.[1]
    if (id && TASK_END.test(notice!)) await taskDrop($, id)
  }
}

async function taskDrop($: EngineInterface, id: string) {
  await update($, tasks, now => Object.fromEntries(Object.entries(now).filter(([key]) => key !== id)))
}

// The classifier's deny adds the call's line; an allow of the same call later (a rule, or the classifier) drops it.
// rule: classic events not used; another plugin's hook can skip this mod's classic.PostToolUse.
function permissionsWatch(on: Parameters<Register>[0]) {
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'allow') await permissionDrop($, e)

    return verdict
  })

  on('tool.judge', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'allow') await permissionDrop($, e)
    if (verdict.decision === 'deny') await update($, permissions, now => ({ ...now, [permissionKey(e)]: `${e.tool}: ${inputSummary(e.input)}` }))

    return verdict
  })
}

type PermissionCall = { agentId?: string; tool: string; input: unknown }

async function permissionDrop($: EngineInterface, call: PermissionCall) {
  const key = permissionKey(call)
  await update($, permissions, now => Object.fromEntries(Object.entries(now).filter(([k]) => k !== key)))
}

function permissionKey(call: PermissionCall) {
  return JSON.stringify([call.agentId ?? '', call.tool, call.input])
}

// The input's command, file, URL or pattern on one line; another input as its JSON.
function inputSummary(input: unknown) {
  const fields = (input ?? {}) as Record<string, unknown>
  const named = ['command', 'file_path', 'url', 'pattern', 'path'].map(k => fields[k]).find(v => typeof v === 'string')

  return String(named ?? JSON.stringify(input)).replace(/\s+/g, ' ')
}

// The selection shade: 25 % off the theme's background toward the other end, never inverse.
function selectedShadeOf(theme: string) {
  return theme.startsWith('light') ? '#bfbfbf' : '#404040'
}

// The /config theme row's value ('dark', 'light-daltonized', ...); none: 'dark'.
async function themeName($: EngineInterface) {
  const row = (await $.config.list().catch(() => [])).find(r => r.key === 'theme')
  return String(row?.value ?? 'dark')
}

// The pane's rows: each part with something to show, under its header, and the open section under the part of its item.
// A part the settings hide is empty: sync fills none.
function paneRows(shown: SessionView, asks: string[], opened: Output | null, selected: string | null): Row[] {
  const pick = { opened, selected }
  const rows = [
    ...part('Permissions', 'Permissions', textLines(shown, 'permission', asks, pick), opened),
    ...part('Changed', 'Changed', changedRows(shown, selected), opened),
    ...part('Agents', 'Agents', textLines(shown, 'agent', shown.agents, pick), opened),
    ...part('Tasks', shown.mode ? `Tasks (/${shown.mode})` : 'Tasks', taskRows(shown, pick), opened),
  ]

  return rows.length === 0 ? [inactive('Nothing to show.')] : rows
}

type Chosen = { opened: Output | null; selected: string | null }

// A part's header and rows, then the open section when its item sits in this part; nothing when it has no row.
function part(partName: string, header: string, rows: readonly Row[], opened: Output | null): Row[] {
  if (rows.length === 0) return []
  const section: Row[] = opened?.key.startsWith(`${partName}:`) ? [{ kind: 'header', name: opened.title }, { kind: 'output', output: opened }] : []

  return [{ kind: 'header', name: header }, ...rows, ...section]
}

function changedRows(shown: SessionView, selected: string | null): Row[] {
  if (shown.changed.length === 0) return []
  const repoRoot = shown.repoRoot!
  const files = shown.changed.map(file => {
    const name = fileName(file.path)
    const values = { text: file.path, path: file.path, file: `${repoRoot}/${file.path}`, root: shown.projectRoot }
    const item: PressedItem = { kind: 'changedFile', key: `Changed:${file.path}`, label: name, values, cwd: repoRoot, file }

    return { path: file.path, name, item, isSelected: item.key === selected }
  })

  return [{ kind: 'changed', files }]
}

// Permission and agent lines: their placeholders are the line and the project folder.
function textLines(shown: SessionView, kind: 'permission' | 'agent', lines: string[], pick: Chosen): Row[] {
  const partName = kind === 'permission' ? 'Permissions' : 'Agents'
  const color: ThemeKey | undefined = kind === 'permission' ? 'permission' : undefined

  return lines.map(text => {
    const item: PressedItem = { kind, key: `${partName}:${text}`, label: text, values: { text, root: shown.projectRoot }, cwd: shown.projectRoot }

    return { kind: 'line', text, color, item, isSelected: item.key === pick.selected }
  })
}

function taskRows(shown: SessionView, pick: Chosen): Row[] {
  if (shown.note) return [inactive(shown.note)]
  const taskFile = shown.taskFile ?? ''

  return shown.lines.map(task => {
    const values = { text: task.text.trim(), id: task.id ?? '', line: String(task.line), path: taskFile, file: `${shown.projectRoot}/${taskFile}`, root: shown.projectRoot }
    const item: PressedItem = { kind: 'task', key: `Tasks:${task.text}`, label: task.id ?? task.text.trim(), values, cwd: shown.projectRoot }

    return { kind: 'line', text: task.text, item, isSelected: item.key === pick.selected }
  })
}

function inactive(text: string): Row {
  return { kind: 'line', text, color: 'inactive' }
}

function extensionColor(name: string): ThemeKey | undefined {
  const dot = name.lastIndexOf('.')

  return (dot > 0 && EXTENSION_COLORS[name.slice(dot + 1).toLowerCase()]) || undefined
}

function fileName(path: string) {
  return path.split('/').pop()!
}
