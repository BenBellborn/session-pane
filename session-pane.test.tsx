// Run from the repo folder: claude plugin test
import { expect, mock, test } from 'claude-code/testing'

import { diffSides } from './hooks/diff'

type On = Parameters<Parameters<typeof test>[1]>[1]
type Engine = Parameters<Parameters<typeof test>[1]>[0]

// The pane width paneMount draws at: each test line fits, so only a line made too long is cut.
const PANE_COLUMNS = 60

const TODO = [
  '# TODO',
  '',
  '## Task 3: 🔴 [Ben] [Planned] Give XP for puzzles',
  '- **Goal:** x',
  '',
  '## Task 18: 🔴 [Bug] [Planned] Make every legend reach the AI',
  '',
  '## Task: 20a** 🟡 [Bug] **Half-formatted heading',
  '',
  '## Task 46: 🟡 [Refactor] Domain-first names',
].join('\r\n')

type Agent = {
  id?: string
  parentId?: string
  status: string
  type: string
  model?: string
  effort?: string
  lastRequest?: { effort?: string }
  name?: string
  description: string
}

// The task format of the TODO text above; a test without it gets the manifest's defaults.
const HEADING = { options: { taskFormat: 'heading' } }

type Files = {
  todo?: string
  rootTodo?: string
  state?: object
  env?: Record<string, string>
  git?: string
  diff?: string
  agents?: Agent[]
  ran?: string[]
  config?: object | string
  written?: Record<string, string>
}

// The engine's files: docs/TODO.md (`todo`) and TODO.md (`rootTodo`) under the project folder C:/proj, and the filter file when
// `state` is given; the env (USERPROFILE C:/Users/u unless `env` is given), `git status -z` output, `git diff` output and the agent
// list, and config.json (`config`; a string as is). Each git command line run is noted in `ran`, each file written in `written`.
function mockEngine(on: On, files: Files) {
  const env = files.env ?? { USERPROFILE: 'C:/Users/u' }
  const configDir = env.CLAUDE_CONFIG_DIR ?? `${env.USERPROFILE ?? env.HOME}/.claude`
  const reads: Record<string, string | undefined> = {
    'C:/proj/docs/TODO.md': files.todo,
    'C:/proj/TODO.md': files.rootTodo,
    [`${configDir}/cache/session-pane/s1.json`]: files.state && JSON.stringify(files.state),
    [`${configDir}/session-pane/config.json`]: typeof files.config === 'string' ? files.config : files.config && JSON.stringify(files.config),
  }
  on('fs.write', (_$, e) => {
    if (files.written) files.written[e.path.replace(/\\/g, '/')] = e.text

    return { value: undefined }
  })
  on('env.get', (_$, e) => ({ value: env[e.name] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_$, e) => {
    files.ran?.push(e.argv.join(' '))
    if (files.git === undefined) return { value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }
    if (e.argv[1] === 'rev-parse') return { value: { exitCode: 0, stdout: 'C:/proj\n', stderr: '' } }
    if (e.argv[1] === 'diff') return { value: { exitCode: 1, stdout: files.diff ?? '', stderr: '' } }

    return { value: { exitCode: 0, stdout: files.git, stderr: '' } }
  })
  on('agent.list', () => ({ value: files.agents ?? [] }))
  on('command.register', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('process.hookEnv', () => ({ value: { CLAUDE_PROJECT_DIR: 'C:/proj' } }))
  on('fs.read', (_$, e) => {
    const text = reads[e.path.replace(/\\/g, '/')]
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
}

// The pane's shown parts, header name ("Tasks (/fix)") to the lines under it, in pane order. `before` runs once the session started.
// A part's header as the pane draws it, filled to the pane's width.
function header(name: string) {
  return `── ${name} `.padEnd(PANE_COLUMNS, '─')
}

async function paneParts($: Engine, on: On, before?: () => Promise<unknown>) {
  const parts = new Map<string, string[]>()
  let lines: string[] = []
  for (const text of await paneTexts($, on, before)) {
    if (text.startsWith('── ')) parts.set(text.slice(3).replace(/[ ─]+$/, ''), (lines = []))
    else lines.push(text)
  }

  return parts
}

// The lines of the Tasks part; undefined when the part is hidden.
async function paneLines($: Engine, on: On) {
  return [...(await paneParts($, on))].find(([name]) => name.startsWith('Tasks'))?.[1]
}

// The shown text of each top-level Text; a Text nested in another one is part of its parent's text.
async function paneTexts($: Engine, on: On, before?: () => Promise<unknown>) {
  const texts: string[] = []
  const found = await paneTextElements($, on, before)
  for (let i = 0; i < found.length; i += 1 + nestedTextCount(found[i]!)) texts.push(found[i]!.text)

  return texts
}

function nestedTextCount(element: { children: unknown[] }): number {
  const nested = element.children.filter((c): c is { type: string; children: unknown[] } => typeof c === 'object' && c !== null && 'type' in c)

  return nested.reduce((n, c) => n + (c.type === 'Text' ? 1 : 0) + nestedTextCount(c), 0)
}

async function paneTextElements($: Engine, on: On, before?: () => Promise<unknown>, presses: string[] = [], type = 'Text', columns = PANE_COLUMNS) {
  const ui = await paneMount($, on, before, columns)
  for (const key of presses) await ui.press({ key })
  const found = await ui.findAll({ type })
  await ui.unmount()

  return found
}

async function paneMount($: Engine, on: On, before?: () => Promise<unknown>, columns = PANE_COLUMNS) {
  const clock = mock.clock(on)
  await $.session.start({ source: 'startup', cwd: 'C:/proj/docs/adr', isInteractive: true } as never).catch(() => undefined)
  await before?.()
  await clock.advance(2000)

  return $.ui.mount({
    plugin: 'session-pane',
    component: 'Pane',
    requestId: 'session-pane',
    surface: 'terminal',
    props: { title: 'Session', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as never)
}

test('with no filter, every task heading shows in file order', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await paneLines($, on)).toEqual([
    '❯     3: 🔴 [Ben] [Planned] Give XP for puzzles',
    '❯    18: 🔴 [Bug] [Planned] Make every legend reach the AI',
    '❯   20a: 🟡 [Bug] Half-formatted heading',
    '❯    46: 🟡 [Refactor] Domain-first names',
  ])
})

test('a ticket key heading shows its key as id, subtask letter included', HEADING, async ($, on) => {
  mockEngine(on, { todo: ['# TODO', '', '## Task US-1283:  🔴 [Bug] Keyed task', '', '## Task US-1283a: 🟡 Keyed subtask'].join('\r\n') })

  expect(await paneLines($, on)).toEqual([
    '❯ US-1283: 🔴 [Bug] Keyed task',
    '❯ US-1283a: 🟡 Keyed subtask',
  ])
})

test('a task id shows in the suggestion color', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  const id = (await paneTextElements($, on)).find(t => t.text === '    3')
  expect(id?.props.color).toBe('suggestion')
})

test('a filter shows only its tasks, in its order; a task gone from TODO.md drops out', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, state: { mode: 'fix', ids: ['46', '99', '18'] } })

  expect(await paneLines($, on)).toEqual([
    '❯    46: 🟡 [Refactor] Domain-first names',
    '❯    18: 🔴 [Bug] [Planned] Make every legend reach the AI',
  ])
})

test('a filter names its run in the Tasks header', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, state: { mode: 'plan', ids: ['18'] } })

  expect([...(await paneParts($, on)).keys()]).toEqual(['Tasks (/plan)'])
})

test('a filter with no task left hides the Tasks part', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, state: { mode: 'plan', ids: [] } })

  expect(await paneLines($, on)).toBeUndefined()
})

test('a project with no task file hides the Tasks part', HEADING, async ($, on) => {
  mockEngine(on, { git: '' })

  expect(await paneLines($, on)).toBeUndefined()
})

test('with nothing to show in any part, the pane says so', async ($, on) => {
  mockEngine(on, {})

  expect(await paneTexts($, on)).toEqual(['Nothing to show.'])
})

const CHECKBOXES = ['# TODO', '- [ ] Write the docs', '- [x] Pick a name', '  * [ ] Nested item', 'Text - [ ] not at line start'].join('\n')

test('by default, each open checkbox line of TODO.md shows; checked ones do not', async ($, on) => {
  mockEngine(on, { rootTodo: CHECKBOXES, todo: TODO })

  expect(await paneLines($, on)).toEqual(['❯ Write the docs', '❯ Nested item'])
})

test('the first task file found fills the Tasks part', { options: { taskFiles: 'tasks.md, docs/TODO.md', taskFormat: 'heading' } }, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect((await paneLines($, on))?.[0]).toBe('❯     3: 🔴 [Ben] [Planned] Give XP for puzzles')
})

test('a custom pattern takes its id and title groups', { options: { taskFormat: 'custom', taskPattern: '^TODO\\((?<id>\\w+)\\): (?<title>.*)$' } }, async ($, on) => {
  mockEngine(on, { rootTodo: ['TODO(a1): Ship it', 'other', 'TODO(b2): Test it'].join('\n') })

  expect(await paneLines($, on)).toEqual(['❯    a1: Ship it', '❯    b2: Test it'])
})

test('a bad custom pattern shows its error in the Tasks part', { options: { taskFormat: 'custom', taskPattern: '(' } }, async ($, on) => {
  mockEngine(on, { rootTodo: CHECKBOXES })

  expect((await paneLines($, on))?.[0]).toMatch(/^Bad task pattern: /)
})

test('a custom format with no pattern says so', { options: { taskFormat: 'custom' } }, async ($, on) => {
  mockEngine(on, { rootTodo: CHECKBOXES })

  expect(await paneLines($, on)).toEqual(['Task format is custom, but the task pattern is empty.'])
})

test('a hidden part shows no header', { options: { showChanged: false, showAgents: false } }, async ($, on) => {
  mockEngine(on, { rootTodo: CHECKBOXES })

  const texts = await paneTexts($, on)
  expect(texts.filter(text => text.startsWith('── '))).toEqual([header('Tasks')])
})

test('the filter file sits under CLAUDE_CONFIG_DIR when it is set', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, env: { CLAUDE_CONFIG_DIR: 'D:/cfg', HOME: '/home/u' }, state: { mode: 'fix', ids: ['18'] } })

  expect(await paneLines($, on)).toEqual(['❯    18: 🔴 [Bug] [Planned] Make every legend reach the AI'])
})

test('with no changed file and no running agent, those parts are hidden', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: '' })

  expect([...(await paneParts($, on)).keys()]).toEqual(['Tasks'])
})

test('changed files show by name on one line; a rename shows its new name', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', '?? docs/new.md', 'R  lib/b2.py', 'lib/b.py', '?? build/out', ''].join('\0') })

  expect((await paneParts($, on)).get('Changed')!.join('')).toBe('a.py, new.md, b2.py, out')
})

test('a .stackdump file is not listed as changed', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', '?? bash.exe.stackdump', '?? tools/sh.stackdump', ''].join('\0') })

  expect((await paneParts($, on)).get('Changed')!.join('')).toBe('a.py')
})

test('each changed file shows in its extension color and the commas in the theme gray', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/A.CS', ' M x.py', '?? docs/new.md', '?? build/out', ''].join('\0') })

  const colors = (await paneTextElements($, on)).slice(1, 9).map(t => [t.text, t.props.color])
  expect(colors).toEqual([
    ['A.CS', 'ide'],
    [', ', 'inactive'],
    ['x.py', 'warning'],
    [', ', 'inactive'],
    ['new.md', 'permission'],
    [', ', 'inactive'],
    ['out', undefined],
    [header('Tasks'), 'inactive'],
  ])
})

const DIFF = ['diff --git a/src/a.py b/src/a.py', '--- a/src/a.py', '+++ b/src/a.py', '@@ -1,2 +1,2 @@', '-old', '+new', ' same', ''].join('\n')

test('a press on a changed file shows its diff against HEAD from its first hunk, highlighted as its file type', HEADING, async ($, on) => {
  const ran: string[] = []
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: DIFF.replace(/\n/g, '\r\n'), ran })

  const ui = await paneMount($, on)
  await ui.press({ key: 'Changed:src/a.py' })
  expect(ran).toContain('git diff HEAD -- src/a.py')
  expect(await ui.find({ type: 'Text', text: '── Diff a.py ' })).toBeDefined()
  expect((await ui.find({ type: 'Code' }))!.props).toMatchObject({ source: '@@ -1,2 +1,2 @@\n-old\n+new\n same', format: 'diff', path: 'src/a.py' })
  await ui.unmount()
})

test('a wide pane shows a diff side by side: old lines left, new lines right, by line number', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: DIFF })

  const ui = await paneMount($, on, undefined, 160)
  await ui.press({ key: 'Changed:src/a.py' })
  expect(await ui.findAll({ type: 'Code' })).toEqual([])
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('@@ -1,2 +1,2 @@')
  expect(texts).toContain(`${'1 -old'.padEnd(79)}│${'1 +new'.padEnd(79)}`)
  expect(texts).toContain(`${'2  same'.padEnd(79)}│${'2  same'.padEnd(79)}`)
  await ui.unmount()
})

test('a wide pane shows a new file side by side with a blank left half', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: ['?? docs/new.md', ''].join('\0'), diff: 'new file mode 100644\n@@ -0,0 +1 @@\n+x\n' })

  const texts = (await paneTextElements($, on, undefined, ['Changed:docs/new.md'], 'Text', 160)).map(t => t.text)
  expect(texts).toContain(`${' '.repeat(79)}│${'1 +x'.padEnd(79)}`)
})

test('a wide pane cuts a long line and turns a tab into spaces, so each half keeps its width', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: `@@ -9,1 +9,1 @@\n-\tx\n+${'y'.repeat(100)}\n` })

  const texts = (await paneTextElements($, on, undefined, ['Changed:src/a.py'], 'Text', 160)).map(t => t.text)
  expect(texts).toContain(`${'9 -    x'.padEnd(79)}│9 +${'y'.repeat(75)}…`)
})

test('a wide pane shows a diff with no hunk (a binary file) as is', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M a.png', ''].join('\0'), diff: 'Binary files a/a.png and b/a.png differ\n' })

  const ui = await paneMount($, on, undefined, 160)
  await ui.press({ key: 'Changed:a.png' })
  expect((await ui.find({ type: 'Code' }))!.props.source).toBe('Binary files a/a.png and b/a.png differ')
  await ui.unmount()
})

const same = (line: number, text: string) => ({ kind: 'pair', left: { line, text, change: 'same' }, right: { line, text, change: 'same' } })

test('diffSides pairs a context line with itself and steps both line numbers', async () => {
  expect(diffSides('@@ -4,2 +7,2 @@ def f():\n a\n b')).toEqual([
    { kind: 'hunk', text: '@@ -4,2 +7,2 @@ def f():' },
    { kind: 'pair', left: { line: 4, text: 'a', change: 'same' }, right: { line: 7, text: 'a', change: 'same' } },
    { kind: 'pair', left: { line: 5, text: 'b', change: 'same' }, right: { line: 8, text: 'b', change: 'same' } },
  ])
})

test('diffSides pairs a removed run with the added run after it row by row; the shorter side is blank', async () => {
  expect(diffSides('@@ -1,3 +1,2 @@\n-a\n-b\n+c\n d\n-e\n+f\n+g')).toEqual([
    { kind: 'hunk', text: '@@ -1,3 +1,2 @@' },
    { kind: 'pair', left: { line: 1, text: 'a', change: 'removed' }, right: { line: 1, text: 'c', change: 'added' } },
    { kind: 'pair', left: { line: 2, text: 'b', change: 'removed' }, right: null },
    { kind: 'pair', left: { line: 3, text: 'd', change: 'same' }, right: { line: 2, text: 'd', change: 'same' } },
    { kind: 'pair', left: { line: 4, text: 'e', change: 'removed' }, right: { line: 3, text: 'f', change: 'added' } },
    { kind: 'pair', left: null, right: { line: 4, text: 'g', change: 'added' } },
  ])
})

test('diffSides starts a new run when a removed line follows an added one', async () => {
  expect(diffSides('@@ -1,2 +1,1 @@\n-a\n+b\n-c')).toEqual([
    { kind: 'hunk', text: '@@ -1,2 +1,1 @@' },
    { kind: 'pair', left: { line: 1, text: 'a', change: 'removed' }, right: { line: 1, text: 'b', change: 'added' } },
    { kind: 'pair', left: { line: 2, text: 'c', change: 'removed' }, right: null },
  ])
})

test('diffSides shows a new file as added lines with a blank left side', async () => {
  expect(diffSides('@@ -0,0 +1,2 @@\n+a\n+b')).toEqual([
    { kind: 'hunk', text: '@@ -0,0 +1,2 @@' },
    { kind: 'pair', left: null, right: { line: 1, text: 'a', change: 'added' } },
    { kind: 'pair', left: null, right: { line: 2, text: 'b', change: 'added' } },
  ])
})

test('diffSides restarts the line numbers at each hunk', async () => {
  expect(diffSides('@@ -1 +1 @@\n a\n@@ -20 +30 @@\n b')).toEqual([{ kind: 'hunk', text: '@@ -1 +1 @@' }, same(1, 'a'), { kind: 'hunk', text: '@@ -20 +30 @@' }, { kind: 'pair', left: { line: 20, text: 'b', change: 'same' }, right: { line: 30, text: 'b', change: 'same' } }])
})

test('diffSides skips the file header and the no-newline note', async () => {
  expect(diffSides('diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n\\ No newline at end of file\n')).toEqual([
    { kind: 'hunk', text: '@@ -1 +1 @@' },
    { kind: 'pair', left: { line: 1, text: 'a', change: 'removed' }, right: { line: 1, text: 'a', change: 'added' } },
  ])
})

test('diffSides skips a second file header after a hunk (a custom diff action over several files)', async () => {
  expect(diffSides('@@ -1 +1 @@\n-a\ndiff --git a/y b/y\nindex 1..2\n--- a/y\n+++ b/y\n@@ -5 +5 @@\n+b')).toEqual([
    { kind: 'hunk', text: '@@ -1 +1 @@' },
    { kind: 'pair', left: { line: 1, text: 'a', change: 'removed' }, right: null },
    { kind: 'hunk', text: '@@ -5 +5 @@' },
    { kind: 'pair', left: null, right: { line: 5, text: 'b', change: 'added' } },
  ])
})

test('diffSides gives no row for text with no hunk', async () => {
  expect(diffSides('Binary files a/a.png and b/a.png differ')).toEqual([])
})

test('a second press on the same file closes its diff', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: DIFF })

  expect(await paneTextElements($, on, undefined, ['Changed:src/a.py', 'Changed:src/a.py'], 'Code')).toEqual([])
})

test('a press on an untracked file shows it whole, as added lines', HEADING, async ($, on) => {
  const ran: string[] = []
  mockEngine(on, { todo: TODO, git: ['?? docs/new.md', ''].join('\0'), diff: 'new file mode 100644\n@@ -0,0 +1 @@\n+x\n', ran })

  const [code] = await paneTextElements($, on, undefined, ['Changed:docs/new.md'], 'Code')
  expect(ran).toContain('git diff --no-index -- /dev/null docs/new.md')
  expect(code!.props.source).toBe('@@ -0,0 +1 @@\n+x')
})

test('git output with no hunk (a binary file) shows as is', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M a.png', ''].join('\0'), diff: 'Binary files a/a.png and b/a.png differ\n' })

  const [code] = await paneTextElements($, on, undefined, ['Changed:a.png'], 'Code')
  expect(code!.props.source).toBe('Binary files a/a.png and b/a.png differ')
})

test('each running agent shows as model family, type and name; ended agents drop out', HEADING, async ($, on) => {
  mockEngine(on, {
    todo: TODO,
    agents: [
      { status: 'running', type: 'Explore', model: 'claude-opus-5-5', name: 'scout', description: 'find it' },
      { status: 'completed', type: 'Plan', model: 'claude-opus-5-5', description: 'done' },
      { status: 'waiting', type: 'general-purpose', model: 'claude-haiku-5-5', description: 'search docs' },
    ],
  })

  expect((await paneParts($, on)).get('Agents')).toEqual(['Opus:Explore - scout', 'Haiku:general-purpose - search docs'])
})

test('a sub agent shows indented under the agent that started it', HEADING, async ($, on) => {
  mockEngine(on, {
    todo: TODO,
    agents: [
      { id: 'a1', status: 'running', type: 'Plan', model: 'claude-opus-5-5', name: 'lead', description: 'plan it' },
      { id: 'a2', parentId: 'a1', status: 'running', type: 'Explore', model: 'claude-haiku-5-5', description: 'find files' },
      { id: 'a3', status: 'running', type: 'Explore', model: 'claude-sonnet-5-5', description: 'other' },
    ],
  })

  expect((await paneParts($, on)).get('Agents')).toEqual(['Opus:Plan - lead', '└ Haiku:Explore - find files', 'Sonnet:Explore - other'])
})

test('an agent line shows the effort its last request carried, else the one set for it', HEADING, async ($, on) => {
  mockEngine(on, {
    todo: TODO,
    agents: [
      { status: 'running', type: 'fix-worker', model: 'claude-opus-5-5', effort: 'high', lastRequest: { effort: 'medium' }, description: 'T22' },
      { status: 'running', type: 'Explore', model: 'claude-sonnet-5-5', effort: 'low', description: 'find it' },
    ],
  })

  expect((await paneParts($, on)).get('Agents')).toEqual(['Opus:medium:fix-worker - T22', 'Sonnet:low:Explore - find it'])
})

test('an agent line colors its model and effort by tier: Opus and high yellow, Fable and max orange; the rest plain', HEADING, async ($, on) => {
  mockEngine(on, {
    todo: TODO,
    agents: [
      { status: 'running', type: 'Plan', model: 'claude-opus-5-5', effort: 'medium', description: 'a' },
      { status: 'running', type: 'Plan', model: 'claude-sonnet-5-5', effort: 'high', description: 'b' },
      { status: 'running', type: 'Plan', model: 'claude-haiku-5-5', effort: 'low', description: 'c' },
      { status: 'running', type: 'Plan', model: 'claude-fable-5-2', effort: 'max', description: 'd' },
      { status: 'running', type: 'Plan', model: 'gpt-x', effort: 'xhigh', description: 'e' },
    ],
  })

  const shown = (await paneTextElements($, on)).map(t => [t.text, t.props.color])
  const spans = /^(Opus|Sonnet|Haiku|Fable|gpt-x|medium|high|low|max|xhigh|Plan - [a-e])$/
  expect(shown.filter(([text]) => spans.test(String(text)))).toEqual([
    ['Opus', 'warning'], ['medium', undefined], ['Plan - a', undefined],
    ['Sonnet', undefined], ['high', 'warning'], ['Plan - b', undefined],
    ['Haiku', undefined], ['low', undefined], ['Plan - c', undefined],
    ['Fable', 'claude'], ['max', 'claude'], ['Plan - d', undefined],
    ['gpt-x', undefined], ['xhigh', 'warning'], ['Plan - e', undefined],
  ])
})

test('an agent whose task argument holds line breaks shows on one line', HEADING, async ($, on) => {
  mockEngine(on, {
    todo: TODO,
    agents: [{ status: 'running', type: 'Explore', model: 'claude-opus-5-5', description: 'find it\n  in the repo\r\n' }],
  })

  expect((await paneParts($, on)).get('Agents')).toEqual(['Opus:Explore - find it in the repo'])
})

// A Monitor task and a background Bash task, started once the session started.
function backgroundStart($: Engine, on: On) {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 0 } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))

  return async () => {
    await $.tool.call({ tool: 'Monitor', description: 'Watch the build', timeout_ms: 1000, command: 'tail -f log' } as never)
    await $.tool.call({ tool: 'Bash', command: 'make', description: 'Build the app', run_in_background: true } as never)
  }
}

test('a background task shows under the agents', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect((await paneParts($, on, backgroundStart($, on))).get('Agents')).toEqual(['monitor - Watch the build', 'shell - Build the app'])
})

test('a background task kind shows in its own color', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  on('tool.call', { tool: 'Workflow' }, () => ({ result: { taskId: 'w1', workflowName: 'review' } }))
  const start = backgroundStart($, on)
  const startAll = async () => {
    await start()
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
  }

  const shown = (await paneTextElements($, on, startAll)).map(t => [t.text, t.props.color])
  expect(shown.filter(([text]) => /^(shell|monitor|workflow)$/.test(String(text)))).toEqual([
    ['monitor', 'planMode'], ['shell', 'bashBorder'], ['workflow', 'ide'],
  ])
})

test('an agent line longer than the pane is cut to its width with an ellipsis', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, agents: [{ ...SCOUT, name: 'x'.repeat(PANE_COLUMNS) }] })

  expect((await paneParts($, on)).get('Agents')).toEqual([`Opus:Explore - ${'x'.repeat(PANE_COLUMNS - 16)}…`])
})

test('a background command whose argument holds line breaks shows on one line', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))
  const start = () => $.tool.call({ tool: 'Bash', command: 'cd app &&\n  make\n', run_in_background: true } as never)

  expect((await paneParts($, on, start)).get('Agents')).toEqual(['shell - cd app && make'])
})

test('a shell task drops out when its end notice comes in as a prompt', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  const start = backgroundStart($, on)
  on('prompt.submit', (_$, e) => e as never)
  const startAndEnd = async () => {
    await start()
    await $.prompt.submit({
      origin: { kind: 'task-notification' },
      text:
        '<task-notification><task-id>b1</task-id><status>completed</status>' +
        '<summary>Background command "Build the app" completed (exit code 0)</summary></task-notification>',
    } as never)
  }

  expect((await paneParts($, on, startAndEnd)).get('Agents')).toEqual(['monitor - Watch the build'])
})

test('a background task drops out at its end notice', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  const start = backgroundStart($, on)
  on('session.receive', (_$, e) => e as never)
  const startAndEnd = async () => {
    await start()
    await $.session.receive({
      origin: { kind: 'task-notification' },
      text: '<task-notification><task-id>m1</task-id><status>completed</status></task-notification>',
    } as never)
  }

  expect((await paneParts($, on, startAndEnd)).get('Agents')).toEqual(['shell - Build the app'])
})

const PUSH = { tool: 'Bash', input: { command: 'git push\n  origin main' } }
const WRITE = { tool: 'Write', input: { file_path: 'C:/proj/a.py', content: 'x' } }

// The classifier's verdict on each call, in order; the test's hooks stand for the engine beneath the mod.
function judged($: Engine, on: On, verdicts: [typeof PUSH, 'allow' | 'deny'][]) {
  let i = 0
  on('tool.judge', () => ({ decision: verdicts[i++]![1] }))

  return async () => {
    for (const [call] of verdicts) await $.tool.judge({ ...call, tool_use_id: `t${i}` } as never)
  }
}

test('each call auto mode denied shows as one line under a Permissions header at the top', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  const texts = await paneTexts($, on, judged($, on, [[PUSH, 'deny'], [WRITE, 'deny']]))
  expect(texts.slice(0, 4)).toEqual([header('Permissions'), 'Bash: git push origin main', 'Write: C:/proj/a.py', header('Tasks')])
})

test('with no denied call, no Permissions part shows', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect((await paneParts($, on, judged($, on, [[PUSH, 'allow']]))).has('Permissions')).toBe(false)
})

test('a denied call the classifier allows later drops out; the others stay', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  const parts = await paneParts($, on, judged($, on, [[PUSH, 'deny'], [WRITE, 'deny'], [PUSH, 'allow']]))
  expect(parts.get('Permissions')).toEqual(['Write: C:/proj/a.py'])
})

test('a denied call a rule allows later drops out', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  const deny = judged($, on, [[PUSH, 'deny']])
  on('tool.check', () => ({ decision: 'allow' }))
  const denyAndRetry = async () => {
    await deny()
    await $.tool.check(PUSH as never)
  }

  expect((await paneParts($, on, denyAndRetry)).has('Permissions')).toBe(false)
})

test('a new prompt keeps every denied call', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  const deny = judged($, on, [[PUSH, 'deny']])
  on('prompt.submit', (_$, e) => e as never)
  const denyAndPrompt = async () => {
    await deny()
    await $.prompt.submit({ text: 'go on' } as never)
  }

  expect((await paneParts($, on, denyAndPrompt)).get('Permissions')).toEqual(['Bash: git push origin main'])
})

test('a /permissions grant of a denied command drops its line before any retry; the others stay', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })
  const deny = judged($, on, [[PUSH, 'deny'], [WRITE, 'deny']])
  on('prompt.submit', (_$, e) => e as never)
  const grant = 'Permission granted for this exact command only, as one whole string: "git push\\n  origin main". This does not approve'
  const denyAndGrant = async () => {
    await deny()
    await $.prompt.submit({ text: `${grant} any other command.\n1a` } as never)
  }

  expect((await paneParts($, on, denyAndGrant)).get('Permissions')).toEqual(['Write: C:/proj/a.py'])
})

// Each highlighted Text after the presses: drawn on the dark theme's selection shade, never inverse.
async function highlighted($: Engine, on: On, presses: string[], before?: () => Promise<unknown>) {
  const texts = await paneTextElements($, on, before, presses)

  expect(texts.filter(t => t.props.inverse)).toEqual([])
  return texts.filter(t => t.props.backgroundColor === '#404040').map(t => t.text)
}

const SCOUT = { status: 'running', type: 'Explore', model: 'claude-opus-5-5', name: 'scout', description: 'find it' }

test('a press on a changed file highlights its name only', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ' M b.md', ''].join('\0'), diff: DIFF })

  expect(await highlighted($, on, ['Changed:src/a.py'])).toEqual(['a.py'])
})

test('a second press on a changed file clears its highlight', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: DIFF })

  expect(await highlighted($, on, ['Changed:src/a.py', 'Changed:src/a.py'])).toEqual([])
})

test('a press on an agent line highlights the full line', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, agents: [SCOUT] })

  expect(await highlighted($, on, ['Agents:Opus:Explore - scout'])).toEqual(['Opus:Explore - scout'.padEnd(PANE_COLUMNS)])
})

test('a press on a task line moves the highlight there from the line selected before', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, agents: [SCOUT] })

  expect(await highlighted($, on, ['Agents:Opus:Explore - scout', 'Tasks:   46: 🟡 [Refactor] Domain-first names'])).toEqual([
    '❯    46: 🟡 [Refactor] Domain-first names'.padEnd(PANE_COLUMNS),
  ])
})

test('a second press on a selected line clears its highlight', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await highlighted($, on, ['Tasks:   46: 🟡 [Refactor] Domain-first names', 'Tasks:   46: 🟡 [Refactor] Domain-first names'])).toEqual([])
})

test('a press on a permission line highlights it', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await highlighted($, on, ['Permissions:Bash: git push origin main'], judged($, on, [[PUSH, 'deny']]))).toEqual([
    'Bash: git push origin main'.padEnd(PANE_COLUMNS),
  ])
})

test('a selected line sits 25 % off the theme background, darker under a light theme', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: ' M src/a.py\0' })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'light' }] }) as never)

  const ui = await paneMount($, on)
  await ui.press({ key: 'Changed:src/a.py' })
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  expect(texts.filter(t => t.props.backgroundColor === '#bfbfbf').map(t => t.text)).toEqual(['a.py'])
})

const TASK_46 = 'Tasks:   46: 🟡 [Refactor] Domain-first names'

test('a session start writes config.json with the default actions when it is missing', HEADING, async ($, on) => {
  const written: Record<string, string> = {}
  mockEngine(on, { todo: TODO, written })

  await paneMount($, on).then(ui => ui.unmount())
  expect(JSON.parse(written['C:/Users/u/.claude/session-pane/config.json']!)).toEqual({
    onPress: { changedFile: 'diff', task: 'select', permission: 'select', agent: 'select' },
  })
})

test('a session start keeps a config.json that is there', HEADING, async ($, on) => {
  const written: Record<string, string> = {}
  mockEngine(on, { todo: TODO, config: { onPress: {} }, written })

  await paneMount($, on).then(ui => ui.unmount())
  expect(written).toEqual({})
})

test('a run action starts the program with the task file and line filled in', HEADING, async ($, on) => {
  const spawned: { argv: readonly string[]; cwd?: string }[] = []
  mockEngine(on, { todo: TODO, config: { onPress: { task: { run: ['notepad++', '-n{line}', '{file}'] } } } })
  on('process.spawn', async function* (_$, e) {
    spawned.push({ argv: e.argv, cwd: e.cwd })
    yield* []

    return { value: { code: 0, signal: null } } as never
  })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  await ui.unmount()
  expect(spawned).toEqual([{ argv: ['notepad++', '-n10', 'C:/proj/docs/TODO.md'], cwd: 'C:/proj' }])
})

test('a run action on a changed file fills in its first changed line', HEADING, async ($, on) => {
  const spawned: (readonly string[])[] = []
  mockEngine(on, { todo: TODO, git: [' M src/a.py', ''].join('\0'), diff: '@@ -4,2 +7,3 @@\n+x\n', config: { onPress: { changedFile: { run: ['code', '-g', '{file}:{line}'] } } } })
  on('process.spawn', async function* (_$, e) {
    spawned.push(e.argv)
    yield* []

    return { value: { code: 0, signal: null } } as never
  })

  const ui = await paneMount($, on)
  await ui.press({ key: 'Changed:src/a.py' })
  await ui.unmount()
  expect(spawned).toEqual([['code', '-g', 'C:/proj/src/a.py:7']])
})

test('a show action opens a section with the command output under the pressed item', HEADING, async ($, on) => {
  const ran: string[] = []
  mockEngine(on, { todo: TODO, git: '', ran, config: { onPress: { task: { show: ['git', 'log', '--grep', 'Task {id}'] } } } })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  expect(ran).toContain('git log --grep Task 46')
  expect(texts.slice(-2)).toEqual([header('git 46'), 'No output.'])
})

test('a submit action sends the filled text as a prompt', HEADING, async ($, on) => {
  const sent: string[] = []
  mockEngine(on, { todo: TODO, config: { onPress: { task: { submit: 'Explain task {id}' } } } })
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)

    return e as never
  })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  await ui.unmount()
  expect(sent).toEqual(['Explain task 46'])
})

test('a submit action whose text starts with a slash runs that command', HEADING, async ($, on) => {
  const commands: string[] = []
  mockEngine(on, { todo: TODO, config: { onPress: { task: { submit: '/fix {id}' } } } })
  on('command.run', (_$, e) => {
    commands.push(`${e.command} ${e.args}`)

    return { value: {} } as never
  })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  await ui.unmount()
  expect(commands).toContain('fix 46')
})

test('a fill action writes the filled text in the prompt box', HEADING, async ($, on) => {
  const filled: string[] = []
  mockEngine(on, { todo: TODO, agents: [SCOUT], config: { onPress: { agent: { fill: 'What does {text} do?' } } } })
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)

    return { isFilled: true } as never
  })

  const ui = await paneMount($, on)
  await ui.press({ key: 'Agents:Opus:Explore - scout' })
  await ui.unmount()
  expect(filled).toEqual(['What does Opus:Explore - scout do?'])
})

test('a config.json that is no JSON shows a config error section and keeps the highlight', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, config: '{ onPress' })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  expect(texts).toContain(header('Config error'))
  expect(texts).toContain('❯    46: 🟡 [Refactor] Domain-first names'.padEnd(PANE_COLUMNS))
})

test('a diff action on a task shows a config error', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, config: { onPress: { task: 'diff' } } })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  expect(texts.at(-1)).toBe('onPress.task: diff works only on a changed file.')
})
