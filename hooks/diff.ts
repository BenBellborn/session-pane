// One side of a side-by-side diff row: a line number on its side of the change, the line's text without its marker.
export type DiffHalf = { line: number; text: string; change: 'same' | 'removed' | 'added' }

// One side-by-side row: a hunk header as is, or an old line (left) next to a new line (right); null: blank half.
export type DiffRow = { kind: 'hunk'; text: string } | { kind: 'pair'; left: DiffHalf | null; right: DiffHalf | null }

// The rows so far, the open run of removed and added lines not yet paired, the next old (left) and new (right) line numbers,
// and whether the line read last was in a hunk.
type Sides = { rows: DiffRow[]; removed: DiffHalf[]; added: DiffHalf[]; left: number; right: number; isInHunk: boolean }

// "@@ -12,3 +12,4 @@ name": the old start, then the new start. A count of one is left out ("@@ -0,0 +1 @@").
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

// Unified diff text to side-by-side rows. A run of removed lines pairs row by row with the run of added lines after it.
export function diffSides(source: string): DiffRow[] {
  const sides: Sides = { rows: [], removed: [], added: [], left: 0, right: 0, isInHunk: false }
  for (const text of source.split(/\r?\n/)) lineAdd(sides, text)
  runPair(sides)

  return sides.rows
}

// rule: other line than ' ', '-', '+', '\' ends hunk; file header up to next @@ makes no row.
// "\ No newline at end of file" makes no row either.
function lineAdd(sides: Sides, text: string) {
  const hunk = HUNK.exec(text)
  if (hunk) return hunkStart(sides, text, Number(hunk[1]), Number(hunk[2]))
  if (!sides.isInHunk) return
  if (text.startsWith('-')) return removedAdd(sides, text.slice(1))
  if (text.startsWith('+')) return void sides.added.push({ line: sides.right++, text: text.slice(1), change: 'added' })
  if (text.startsWith(' ')) return sameAdd(sides, text.slice(1))
  if (!text.startsWith('\\')) sides.isInHunk = false
}

function hunkStart(sides: Sides, text: string, left: number, right: number) {
  runPair(sides)
  sides.rows.push({ kind: 'hunk', text })
  sides.left = left
  sides.right = right
  sides.isInHunk = true
}

// A removed line after added ones starts a new run.
function removedAdd(sides: Sides, text: string) {
  if (sides.added.length > 0) runPair(sides)
  sides.removed.push({ line: sides.left++, text, change: 'removed' })
}

function sameAdd(sides: Sides, text: string) {
  runPair(sides)
  sides.rows.push({ kind: 'pair', left: { line: sides.left++, text, change: 'same' }, right: { line: sides.right++, text, change: 'same' } })
}

// The open run as rows, removed line i next to added line i; the shorter side's rows get a blank half.
function runPair(sides: Sides) {
  for (let i = 0; i < Math.max(sides.removed.length, sides.added.length); i++) {
    sides.rows.push({ kind: 'pair', left: sides.removed[i] ?? null, right: sides.added[i] ?? null })
  }
  sides.removed = []
  sides.added = []
}

// rule: a diff half counts terminal cells, not String.length: a CJK character or emoji draws 2 cells, a combining mark 0.
const ZERO_CELLS = /^[\p{Mn}\p{Me}\p{Cf}]$/u
const TWO_CELLS = /^(?:[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]|\p{Emoji_Presentation})$/u

function pointCells(point: string) {
  if (ZERO_CELLS.test(point)) return 0
  return TWO_CELLS.test(point) ? 2 : 1
}

function cellWidth(text: string) {
  let cells = 0
  for (const point of text) cells += pointCells(point)
  return cells
}

// Text at most `width` cells wide; longer text ends in "…".
export function cellCut(text: string, width: number) {
  if (cellWidth(text) <= width) return text
  let cut = ''
  let cells = 0
  for (const point of text) {
    cells += pointCells(point)
    if (cells > width - 1) break
    cut += point
  }
  return `${cut}…`
}

// Text padded with spaces to `width` cells.
export function cellPad(text: string, width: number) {
  return text + ' '.repeat(Math.max(width - cellWidth(text), 0))
}
