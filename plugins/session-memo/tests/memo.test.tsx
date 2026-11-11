import { expect, test } from 'claude-code/testing'

const PATH = '/proj/.session-memo/s1.md'
const SEP = '\n<!-- session-memo -->\n'

const PANE = {
  plugin: 'session-memo',
  component: 'Pane',
  requestId: 'session-memo',
  props: {
    title: 'セッションメモ',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Box = { filled: { text: string; mode?: string }[]; toasts: string[] }

// 置き場を偽のファイルで持ち、入力欄・トーストを記録する。
const harness = (on: Parameters<Parameters<typeof test>[1]>[1], files: Map<string, string>) => {
  const box: Box = { filled: [], toasts: [] }
  on('session.root', () => ({ value: '/proj' }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.read', (_, e: { path: string }) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.exists', (_, e: { path: string }) => ({ value: files.has(e.path) }))
  on('fs.write', (_, e: { path: string; text: string }) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'memo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.fill', (_, e: { text: string; mode?: string }) => {
    box.filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true, text: e.text }
  })
  on('ui.toast', (_, e: { text: string }) => {
    box.toasts.push(e.text)
    return { value: undefined }
  })
  return box
}

test('最初は5行の欄が1つ。書いた内容は改行ごと md に保存される', async ($, on) => {
  const files = new Map<string, string>()
  harness(on, files)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'card-0-0' }))?.props.rows).toBe(5)
  await ui.input({ key: 'card-0-0', text: '一行目\n二行目' })
  expect(files.get(PATH)).toBe('一行目\n二行目')
  expect(files.get('/proj/.session-memo/.gitignore')).toBe('*\n')
  await ui.unmount()
})

test('欄を追加し、欄ごとの「入力欄へ」でその欄の全文だけを入れる', async ($, on) => {
  const files = new Map([[PATH, 'A1\nA2']])
  const box = harness(on, files)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'card-add' })
  await ui.input({ key: 'card-1-1', text: 'B1\n\nB3\n' })
  expect(files.get(PATH)).toBe(`A1\nA2${SEP}B1\n\nB3\n`)

  await ui.press({ key: 'send-1' })
  expect(box.filled).toEqual([{ text: 'B1\n\nB3', mode: 'insert' }])
  await ui.press({ key: 'send-0' })
  expect(box.filled.at(-1)).toEqual({ text: 'A1\nA2', mode: 'insert' })
  await ui.unmount()
})

test('広げる・縮めるで欄の高さが変わり、中身は残る', async ($, on) => {
  const files = new Map([[PATH, 'x']])
  harness(on, files)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'grow-0' })
  expect((await ui.find({ key: 'card-1-0' }))?.props.rows).toBe(10)
  await ui.press({ key: 'shrink-0' })
  await ui.press({ key: 'shrink-0' })
  const card = await ui.find({ key: 'card-3-0' })
  expect(card?.props.rows).toBe(3)
  expect(card?.props.value).toBe('x')
  await ui.unmount()
})

test('欄を消すと残りが詰まる。空の欄は送らずに知らせる', async ($, on) => {
  const files = new Map([[PATH, `a${SEP}b${SEP}`]])
  const box = harness(on, files)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'send-2' })
  expect(box.filled).toEqual([])
  expect(box.toasts.at(-1)).toContain('空')
  await ui.press({ key: 'del-0' })
  expect(files.get(PATH)).toBe(`b${SEP}`)
  expect((await ui.find({ key: 'card-1-0' }))?.props.value).toBe('b')
  await ui.unmount()
})

test('/memo <内容> は新しい欄として足される', async ($, on) => {
  const files = new Map([[PATH, '手書き']])
  harness(on, files)

  await $.command.run({ command: 'memo', args: '追記' })
  expect(files.get(PATH)).toBe(`手書き${SEP}追記`)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'card-1-1' }))?.props.value).toBe('追記')
  await ui.unmount()
})

test('スマホでは本文の表示と送るボタンだけ', async ($, on) => {
  const box = harness(on, new Map([[PATH, '読むだけ']]))

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect((await ui.find({ type: 'Text', text: /読むだけ/ }))?.text).toBe('読むだけ')
  await ui.press({ key: 'send-0' })
  expect(box.filled).toEqual([{ text: '読むだけ', mode: 'insert' }])
  await ui.unmount()
})

const BAND = {
  plugin: 'session-memo',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 60, scroll: { offset: 0, bodyRows: 10 } },
} as const

test('入力欄の上の帯に、中身のある欄の数を出す。打って埋めると増える', async ($, on) => {
  const files = new Map([[PATH, `a${SEP}${SEP}b`]])
  harness(on, files)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: /セッションメモ/ }))?.text).toContain('2件')

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.input({ key: 'card-0-1', text: 'c' })
  expect((await band.find({ type: 'Text', text: /セッションメモ/ }))?.text).toContain('3件')
  await pane.unmount()
  await band.unmount()
})
