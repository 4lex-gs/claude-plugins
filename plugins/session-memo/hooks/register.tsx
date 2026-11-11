import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, Register } from 'claude-code'
import type { MemoCount, MemoLayout } from '../types'

// md ファイルが唯一の中身。欄どうしは SEP の行で区切って 1 つのファイルに置く。
// layout は欄の高さだけを持ち、欄の追加・削除・高さ変更・外からの書き換えのときに n を上げて
// 全欄をファイルの中身で描き直す。打鍵のたびには描き直さない(打鍵中の欄へ古い値を流し込まないため)。
const layout = atom({ plugin: 'session-memo', key: 'layout' } as const, { n: 0, rows: [] } as MemoLayout)
// count: 中身のある欄の数。入力欄の上の帯が件数を出すために読む(ペインは読まないので、打鍵で上げてもペインは描き直さない)。
const count = atom({ plugin: 'session-memo', key: 'count' } as const, 0 as MemoCount)

const PANE = 'session-memo'
const DIR = '.session-memo'
const SEP = '<!-- session-memo -->'
const HEIGHTS = [3, 5, 10, 20]
const DEFAULT_ROWS = 5

const HELP = [
  '欄ごとに自由に書けます(書いたそばから保存。改行は Shift+Enter)',
  '「転記」でその欄の全文を Claude の入力欄へ入れます',
  '/memo <内容>  新しい欄として追加  /memo raw  md ファイルを開く',
]

// 描いた時点の各欄の中身。打鍵はここを書き換えてからファイルへ保存する。
let cache: string[] = ['']
let writing: Promise<unknown> = Promise.resolve()

async function pathOf($: Api) {
  const root = await $.session.root()
  const id = await $.session.id()
  return `${root}/${DIR}/${id}.md`
}

function parse(text: string): string[] {
  return text.split(new RegExp(`\\n?${SEP}\\n?`))
}

async function load($: Api): Promise<string[]> {
  const text = await $.fs.read(await pathOf($)).catch(() => '')
  return parse(typeof text === 'string' ? text : '')
}

async function save($: Api, parts: string[]) {
  const root = await $.session.root()
  const ignore = `${root}/${DIR}/.gitignore`
  if (!(await $.fs.exists(ignore))) await $.fs.write(ignore, '*\n')
  await $.fs.write(await pathOf($), parts.join(`\n${SEP}\n`))
}

// 打鍵の保存は順番どおりに書く(先に出した書き込みが後から上書きしないように)。
function saveQueued($: Api, parts: string[]) {
  const snapshot = [...parts]
  writing = writing.then(() => save($, snapshot)).catch(() => undefined)
  return writing
}

function filled(parts: string[]) {
  return parts.filter(p => p.trim() !== '').length
}

async function recount($: Api, parts: string[]) {
  const n = filled(parts)
  if ((await read($, count)) !== n) await update($, count, () => n)
}

function rowsAt(l: MemoLayout, i: number) {
  return l.rows[i] ?? DEFAULT_ROWS
}

// 欄の数や高さを変えたら全欄を描き直す。
async function relayout($: Api, parts: string[], rows: number[]) {
  await writing
  await save($, parts)
  await update($, layout, l => ({ n: l.n + 1, rows }))
  await recount($, parts)
}

async function current($: Api) {
  await writing
  const parts = await load($)
  const l = await read($, layout)
  return { parts, rows: parts.map((_, j) => rowsAt(l, j)) }
}

async function addCard($: Api, text = '') {
  const { parts, rows } = await current($)
  if (parts.length === 1 && parts[0] === '') {
    await relayout($, [text], rows)
    return
  }
  await relayout($, [...parts, text], [...rows, DEFAULT_ROWS])
}

async function removeCard($: Api, i: number) {
  const { parts, rows } = await current($)
  parts.splice(i, 1)
  rows.splice(i, 1)
  await relayout($, parts.length === 0 ? [''] : parts, rows)
}

async function resize($: Api, i: number, step: 1 | -1) {
  const { parts, rows } = await current($)
  const at = HEIGHTS.indexOf(rows[i] ?? DEFAULT_ROWS)
  const k = Math.min(HEIGHTS.length - 1, Math.max(0, (at < 0 ? 1 : at) + step))
  rows[i] = HEIGHTS[k] ?? DEFAULT_ROWS
  await relayout($, parts, rows)
}

async function reload($: Api) {
  await writing
  await update($, layout, l => ({ ...l, n: l.n + 1 }))
}

async function openFile($: Api) {
  const path = await pathOf($)
  if (!(await $.fs.exists(path))) await save($, [''])
  const ran = await $.process.run(['open', '-t', path]).catch(() => undefined)
  if (ran === undefined || ran.exitCode !== 0) $.ui.toast(`開けませんでした: ${path}`)
  return path
}

function openPane($: Api) {
  return $.ui.open({ id: PANE, title: 'セッションメモ' })
}

async function sendCard($: Api, i: number) {
  const text = (cache[i] ?? '').replace(/\s+$/, '')
  if (text.trim() === '') {
    $.ui.toast('この欄は空です')
    return
  }
  const filled = await $.prompt.fill({ text, mode: 'insert' })
  $.ui.toast(filled.isFilled ? '入力欄へ入れました' : '入力欄へ入れられませんでした')
}

function typed($: Api, i: number, value: string) {
  cache[i] = value
  void saveQueued($, cache).then(() => recount($, cache))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'memo',
      description: 'セッションメモ(引数なし: ペイン / raw: md を開く / <内容>: 新しい欄として追加)',
      argumentHint: '[raw | <内容>]',
    })
    return next(e)
  })

  on('command.run', { command: 'memo' }, async ($, e) => {
    const args = e.args.trim()
    if (args === '') {
      await openPane($)
      return { text: 'セッションメモを開きました。' }
    }
    if (args === 'raw') {
      const path = await openFile($)
      return { text: `md ファイルを開きました: ${path}` }
    }
    await addCard($, args)
    return { text: `メモに追加: ${args}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, count)
    await writing
    const n = filled(await load($))
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>セッションメモ {n}件 </Text>
        <Button key="memo-open" label="メモを開く" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const l = await read($, layout)
    await writing
    const parts = await load($)
    cache = [...parts]
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    // スマホは入力欄を描けない(部品表に名前はあっても描かれない)ので、表示と送るボタンだけにする。
    const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : undefined
    // 欄どうしの区切り線。Box には片側だけの線が無いので、ペインの幅いっぱいの罫線を薄く描く。
    const rule = '─'.repeat(Math.max(10, e.props.bodyColumns))

    return (
      <Box flexDirection="column">
        {parts.map((text, i) => (
          <Box key={`card-box-${i}`} flexDirection="column" marginBottom={1}>
            {Input ? (
              <Input
                key={`card-${l.n}-${i}`}
                value={text}
                rows={rowsAt(l, i)}
                placeholder="メモを書く"
                onInput={(value: string) => typed($, i, value)}
                onSubmit={(value: string) => typed($, i, value)}
              />
            ) : (
              <Text>{text === '' ? '(空)' : text}</Text>
            )}
            <Box gap={1} marginTop={1}>
              <Button key={`send-${i}`} label="転記" onPress={() => void sendCard($, i)} />
              {Input ? <Button key={`grow-${i}`} label="広げる" onPress={() => void resize($, i, 1)} /> : null}
              {Input ? <Button key={`shrink-${i}`} label="縮める" onPress={() => void resize($, i, -1)} /> : null}
              {Input ? <Button key={`del-${i}`} label="この欄を消す" onPress={() => void removeCard($, i)} /> : null}
            </Box>
            <Box marginTop={1}>
              <Text dimColor wrap="truncate-end">{rule}</Text>
            </Box>
          </Box>
        ))}
        {Input ? (
          <Box gap={1}>
            <Button key="card-add" label="＋ 欄を追加" onPress={() => void addCard($)} />
            <Button key="pane-raw" label="md ファイルで開く" onPress={() => void openFile($)} />
            <Button key="pane-reload" label="読み直す" onPress={() => void reload($)} />
          </Box>
        ) : null}
        <Box marginTop={1} flexDirection="column">
          {HELP.map(line => (
            <Text dimColor>{line}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
