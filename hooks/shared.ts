import type { EngineInterface } from 'claude-code'

// CLAUDE_CONFIG_DIR when set, otherwise ~/.claude.
export async function configDirPath($: EngineInterface) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
}

// What `build` returns, or the error it throws.
export function attempt<T>(build: () => T): T | Error {
  try {
    return build()
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}
