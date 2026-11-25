// The README demo's pane, drawn from a made-up session so no real project shows. docs/demo.py runs it as a test and prints its tree.
import { mock, test } from 'claude-code/testing'

const TODO = [
  '# TODO',
  '',
  '## Task 12: 🔴 [Bug] Refund rounds to the wrong cent',
  '',
  '## Task 14: 🟡 [Refactor] Split the order service',
  '',
  '## Task SHOP-88: 🟡 Show the delivery date in the cart',
].join('\n')

const GIT_STATUS = [' M src/orders.py', ' M src/Cart.cs', ' M web/cart.ts', '?? docs/refunds.md', ''].join('\0')

const DIFF = [
  'diff --git a/src/orders.py b/src/orders.py',
  '--- a/src/orders.py',
  '+++ b/src/orders.py',
  '@@ -40,4 +40,4 @@ def refund(order):',
  '     total = order.total - order.fees',
  '-    return round(total * 100) / 100',
  '+    return Decimal(total).quantize(CENT)',
  '',
].join('\n')

const AGENTS = [
  { id: 'a1', status: 'running', type: 'Plan', model: 'claude-opus-5-5', effort: 'high', name: 'lead', description: 'plan the refund fix' },
  { id: 'a2', parentId: 'a1', status: 'running', type: 'Explore', model: 'claude-haiku-5-5', description: 'find every rounding call' },
  { id: 'a3', status: 'running', type: 'general-purpose', model: 'claude-sonnet-5-5', description: 'write refund tests' },
]

const DENIED = [
  { tool: 'Bash', input: { command: 'git push --force origin main' } },
  { tool: 'Write', input: { file_path: 'C:/shop/.env', content: 'x' } },
]

type On = Parameters<Parameters<typeof test>[1]>[1]
type Engine = Parameters<Parameters<typeof test>[1]>[0]

test('demo pane', { options: { taskFormat: 'heading' } }, async ($, on) => {
  mockShop(on)
  await runShopSession($, on)

  const ui = await $.ui.mount({
    plugin: 'session-pane',
    component: 'Pane',
    requestId: 'session-pane',
    surface: 'terminal',
    props: { title: 'Session', isFocused: false, bodyColumns: 58, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
  await ui.press({ key: 'Changed:src/orders.py' })
  console.log(`DEMO-TREE ${JSON.stringify(await ui.drawn())}`)
  await ui.unmount()
})

// The engine beneath the mod: project C:/shop with its TODO.md, git output and agents; the classifier denies every call.
function mockShop(on: On) {
  on('env.get', (_$, e) => ({ value: ({ USERPROFILE: 'C:/Users/u' } as Record<string, string>)[e.name] }))
  on('fs.read', (_$, e) => {
    if (e.path.replace(/\\/g, '/') !== 'C:/shop/docs/TODO.md') throw new Error('ENOENT')

    return { value: TODO }
  })
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_$, e) => {
    if (e.argv[1] === 'rev-parse') return { value: { exitCode: 0, stdout: 'C:/shop\n', stderr: '' } }
    if (e.argv[1] === 'diff') return { value: { exitCode: 1, stdout: DIFF, stderr: '' } }

    return { value: { exitCode: 0, stdout: GIT_STATUS, stderr: '' } }
  })
  on('agent.list', () => ({ value: AGENTS }))
  on('command.register', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('process.hookEnv', () => ({ value: { CLAUDE_PROJECT_DIR: 'C:/shop' } }))
  on('tool.judge', () => ({ decision: 'deny' }))
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 0 } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))
}

// Starts the session, has the classifier deny DENIED, starts two background tasks and lets the pane refresh once.
async function runShopSession($: Engine, on: On) {
  const clock = mock.clock(on)
  await $.session.start({ source: 'startup', cwd: 'C:/shop', isInteractive: true } as never).catch(() => undefined)
  for (const [i, call] of DENIED.entries()) await $.tool.judge({ ...call, tool_use_id: `t${i}` } as never)
  await $.tool.call({ tool: 'Monitor', description: 'Watch the CI run', timeout_ms: 1000, command: 'gh run watch' } as never)
  await $.tool.call({ tool: 'Bash', command: 'pytest', description: 'Run the test suite', run_in_background: true } as never)
  await clock.advance(2000)
}
