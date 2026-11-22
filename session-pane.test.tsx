// Run from the repo folder: claude plugin test
import { expect, mock, test } from 'claude-code/testing'

type On = Parameters<Parameters<typeof test>[1]>[1]
type Engine = Parameters<Parameters<typeof test>[1]>[0]

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

type Agent = { id?: string; parentId?: string; status: string; type: string; model?: string; name?: string; description: string }

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

async function paneTextElements($: Engine, on: On, before?: () => Promise<unknown>, presses: string[] = [], type = 'Text') {
  const ui = await paneMount($, on, before)
  for (const key of presses) await ui.press({ key })
  const found = await ui.findAll({ type })
  await ui.unmount()

  return found
}

async function paneMount($: Engine, on: On, before?: () => Promise<unknown>) {
  const clock = mock.clock(on)
  await $.session.start({ source: 'startup', cwd: 'C:/proj/docs/adr', isInteractive: true } as never).catch(() => undefined)
  await before?.()
  await clock.advance(2000)

  return $.ui.mount({
    plugin: 'session-pane',
    component: 'Pane',
    requestId: 'session-pane',
    surface: 'terminal',
    props: { title: 'Session', isFocused: false, bodyColumns: 10, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as never)
}

test('with no filter, every task heading shows in file order', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await paneLines($, on)).toEqual([
    '    3: 🔴 [Ben] [Planned] Give XP for puzzles',
    '   18: 🔴 [Bug] [Planned] Make every legend reach the AI',
    '  20a: 🟡 [Bug] Half-formatted heading',
    '   46: 🟡 [Refactor] Domain-first names',
  ])
})

test('a filter shows only its tasks, in its order; a task gone from TODO.md drops out', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, state: { mode: 'fix', ids: ['46', '99', '18'] } })

  expect(await paneLines($, on)).toEqual([
    '   46: 🟡 [Refactor] Domain-first names',
    '   18: 🔴 [Bug] [Planned] Make every legend reach the AI',
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

  expect(await paneLines($, on)).toEqual(['Write the docs', 'Nested item'])
})

test('the first task file found fills the Tasks part', { options: { taskFiles: 'tasks.md, docs/TODO.md', taskFormat: 'heading' } }, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect((await paneLines($, on))?.[0]).toBe('    3: 🔴 [Ben] [Planned] Give XP for puzzles')
})

test('a custom pattern takes its id and title groups', { options: { taskFormat: 'custom', taskPattern: '^TODO\\((?<id>\\w+)\\): (?<title>.*)$' } }, async ($, on) => {
  mockEngine(on, { rootTodo: ['TODO(a1): Ship it', 'other', 'TODO(b2): Test it'].join('\n') })

  expect(await paneLines($, on)).toEqual(['   a1: Ship it', '   b2: Test it'])
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
  expect(texts.filter(text => text.startsWith('── '))).toEqual(['── Tasks ─'])
})

test('the filter file sits under CLAUDE_CONFIG_DIR when it is set', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, env: { CLAUDE_CONFIG_DIR: 'D:/cfg', HOME: '/home/u' }, state: { mode: 'fix', ids: ['18'] } })

  expect(await paneLines($, on)).toEqual(['   18: 🔴 [Bug] [Planned] Make every legend reach the AI'])
})

test('with no changed file and no running agent, those parts are hidden', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: '' })

  expect([...(await paneParts($, on)).keys()]).toEqual(['Tasks'])
})

test('changed files show by name on one line; a rename shows its new name', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, git: [' M src/a.py', '?? docs/new.md', 'R  lib/b2.py', 'lib/b.py', '?? build/out', ''].join('\0') })

  expect((await paneParts($, on)).get('Changed')!.join('')).toBe('a.py, new.md, b2.py, out')
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
    ['── Tasks ─', 'inactive'],
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
  expect(texts.slice(0, 4)).toEqual(['── Permissions ', 'Bash: git push origin main', 'Write: C:/proj/a.py', '── Tasks ─'])
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

// Each highlighted Text after the presses: its text and whether it is drawn inverse.
async function highlighted($: Engine, on: On, presses: string[], before?: () => Promise<unknown>) {
  const texts = await paneTextElements($, on, before, presses)

  return texts.filter(t => t.props.inverse).map(t => t.text)
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

  expect(await highlighted($, on, ['Agents:Opus:Explore - scout'])).toEqual(['Opus:Explore - scout'.padEnd(10)])
})

test('a press on a task line moves the highlight there from the line selected before', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, agents: [SCOUT] })

  expect(await highlighted($, on, ['Agents:Opus:Explore - scout', 'Tasks:   46: 🟡 [Refactor] Domain-first names'])).toEqual([
    '   46: 🟡 [Refactor] Domain-first names',
  ])
})

test('a second press on a selected line clears its highlight', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await highlighted($, on, ['Tasks:   46: 🟡 [Refactor] Domain-first names', 'Tasks:   46: 🟡 [Refactor] Domain-first names'])).toEqual([])
})

test('a press on a permission line highlights it', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO })

  expect(await highlighted($, on, ['Permissions:Bash: git push origin main'], judged($, on, [[PUSH, 'deny']]))).toEqual([
    'Bash: git push origin main'.padEnd(10),
  ])
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
  expect(texts.slice(-2)).toEqual(['── git 46 ', 'No output.'])
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
  expect(texts).toContain('── Config error ')
  expect(texts).toContain('   46: 🟡 [Refactor] Domain-first names')
})

test('a diff action on a task shows a config error', HEADING, async ($, on) => {
  mockEngine(on, { todo: TODO, config: { onPress: { task: 'diff' } } })

  const ui = await paneMount($, on)
  await ui.press({ key: TASK_46 })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  expect(texts.at(-1)).toBe('onPress.task: diff works only on a changed file.')
})
