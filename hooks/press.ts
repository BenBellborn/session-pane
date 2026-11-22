import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ChangedFile, Output } from '../types'
import { attempt, configDirPath } from './shared'

// The section a press opened; null: none. It belongs to the selected item and closes when the selection moves.
// rule: the state scan reads atoms only as consts of the reading file; press.ts and register.tsx each declare these two.
const output = atom({ plugin: 'session-pane', key: 'output' } as const, null as Output | null, { shape: 'output-1' })
// The selection key of the one pressed item drawn highlighted ("Tasks:<line>", "Changed:<path>"); null: none.
const selection = atom({ plugin: 'session-pane', key: 'selection' } as const, null as string | null, { shape: 'selection-1' })

// The pane items a press acts on, as config.json's `onPress` names them.
export type ItemKind = 'changedFile' | 'task' | 'permission' | 'agent'

// A pressed pane item. `key`: its selection key. `label`: its name in a section title. `values`: its placeholders
// ({text}, {root}, and per kind {file}, {path}, {line}, {id}). `cwd`: where its commands run. `file`: a changed file's.
export type PressedItem = { kind: ItemKind; key: string; label: string; values: Record<string, string>; cwd: string; file?: ChangedFile }

// What a press does after it selects the item. A command is an argument list, never a shell line: a placeholder holds
// task or tool text, so a shell would run what that text says.
type Action = 'select' | 'diff' | { show: string[]; format?: 'diff' | 'text' } | { run: string[] } | { submit: string } | { fill: string }

const DEFAULT_ACTIONS: Record<ItemKind, Action> = { changedFile: 'diff', task: 'select', permission: 'select', agent: 'select' }

// Writes config.json with the default actions when it is missing, so a user finds the file to edit.
export async function configEnsure($: EngineInterface) {
  const path = await configPath($)
  const text = await $.fs.read(path).catch(() => undefined)
  if (text === undefined) await $.fs.write(path, `${JSON.stringify({ onPress: DEFAULT_ACTIONS }, null, 2)}\n`)
}

// A press on the selected item clears the selection and its section; a press on another item selects it and runs its action.
export async function itemPress($: EngineInterface, item: PressedItem) {
  const wasSelected = (await read($, selection)) === item.key
  await update($, output, () => null)
  await update($, selection, () => (wasSelected ? null : item.key))
  if (wasSelected) return
  // rule: config.json is read on each press, so an edit applies without a restart.
  const action = await configAction($, item.kind)
  if (action instanceof Error) return outputShow($, item, 'Config error', action.message, 'text')
  await actionRun($, action, item)
}

// The action config.json names for this kind; the default when the file or the kind is missing.
async function configAction($: EngineInterface, kind: ItemKind): Promise<Action | Error> {
  const path = await configPath($)
  const text = await $.fs.read(path).catch(() => undefined)
  if (text === undefined) return DEFAULT_ACTIONS[kind]
  const config = attempt(() => JSON.parse(text) as { onPress?: Record<string, unknown> })
  if (config instanceof Error) return new Error(`${path}: ${config.message}`)
  const action = config.onPress?.[kind] ?? DEFAULT_ACTIONS[kind]

  return isAction(action) ? action : new Error(`${path}: onPress.${kind} is no action: ${JSON.stringify(action)}`)
}

async function configPath($: EngineInterface) {
  return `${await configDirPath($)}/session-pane/config.json`
}

function isAction(value: unknown): value is Action {
  const fields = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const isCommand = isArgv(fields.show) || isArgv(fields.run)

  return value === 'select' || value === 'diff' || isCommand || typeof fields.submit === 'string' || typeof fields.fill === 'string'
}

function isArgv(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(arg => typeof arg === 'string')
}

async function actionRun($: EngineInterface, action: Action, item: PressedItem) {
  if (action === 'select') return
  if (action === 'diff') return diffShow($, item)
  const values = await placeholderValues($, item)
  const fill = (template: string) => placeholdersFill(template, values)
  if ('show' in action) return commandShow($, item, action.show.map(fill), action.format ?? 'text')
  if ('run' in action) return programStart($, item, action.run.map(fill))
  if ('submit' in action) return promptSend($, fill(action.submit))
  await $.prompt.fill({ text: fill(action.fill) })
}

// Each {name} in the template replaced by its value; an unknown name stays as written.
function placeholdersFill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole)
}

// A text that starts with a slash runs as that command; the engine refuses a prompt that would.
async function promptSend($: EngineInterface, text: string) {
  const command = /^\/(\S+)\s*([\s\S]*)$/.exec(text)
  if (command) return void (await $.command.run({ command: command[1]!, args: command[2]! }))
  await $.prompt.submit({ text })
}

// The item's placeholders; a changed file's {line} is its first changed line.
async function placeholderValues($: EngineInterface, item: PressedItem) {
  if (!item.file) return item.values

  return { ...item.values, line: String(await firstChangedLine($, item.cwd, item.file)) }
}

async function firstChangedLine($: EngineInterface, repoRoot: string, file: ChangedFile) {
  if (file.isUntracked) return 1
  const ran = await $.process.run(['git', 'diff', '-U0', 'HEAD', '--', file.path], { cwd: repoRoot }).catch(() => undefined)
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/m.exec(ran?.stdout ?? '')

  return Math.max(1, Number(hunk?.[1] ?? 1))
}

async function diffShow($: EngineInterface, item: PressedItem) {
  if (!item.file) return outputShow($, item, 'Config error', `onPress.${item.kind}: diff works only on a changed file.`, 'text')
  await outputShow($, item, `Diff ${item.label}`, await fileDiff($, item.cwd, item.file), 'diff', item.file.path)
}

// Staged and unstaged changes against HEAD; an untracked file whole, as added lines. Git's text without its hunks
// (binary file, error) as is: Code draws a source with no hunk as plain text.
async function fileDiff($: EngineInterface, repoRoot: string, file: ChangedFile) {
  const argv = file.isUntracked ? ['git', 'diff', '--no-index', '--', '/dev/null', file.path] : ['git', 'diff', 'HEAD', '--', file.path]
  const ran = await $.process.run(argv, { cwd: repoRoot })
  const text = textClean(ran.stdout || ran.stderr)
  const firstHunk = text.search(/^@@/m)

  return (firstHunk < 0 ? text : text.slice(firstHunk)) || 'No difference.'
}

async function commandShow($: EngineInterface, item: PressedItem, argv: string[], format: Output['format']) {
  const ran = await $.process.run(argv, { cwd: item.cwd }).catch((error: Error) => ({ stdout: '', stderr: error.message }))
  await outputShow($, item, `${argv[0]} ${item.label}`, textClean(ran.stdout || ran.stderr) || 'No output.', format)
}

// Starts the program and lets it run; the engine ends it with the session if it still runs then.
function programStart($: EngineInterface, item: PressedItem, argv: string[]) {
  const drain = async () => {
    for await (const _piece of $.process.spawn({ argv, cwd: item.cwd })) continue
  }
  void drain().catch((error: Error) => outputShow($, item, `Could not start ${argv[0]}`, error.message, 'text'))
}

// rule: CR stripped; Code refuses control characters other than tab and newline.
function textClean(text: string) {
  return text.replace(/\r/g, '').trimEnd()
}

// Opens the section under the item's part, unless a later press moved the selection away from it.
async function outputShow($: EngineInterface, item: PressedItem, title: string, source: string, format: Output['format'], path?: string) {
  if ((await read($, selection)) !== item.key) return
  await update($, output, () => ({ key: item.key, title, source, format, path }))
}
