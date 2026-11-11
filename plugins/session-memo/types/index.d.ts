export type MemoLayout = { n: number; rows: number[] }
export type MemoCount = number

declare module 'claude-code' {
  interface PluginState {
    'session-memo': { layout: MemoLayout; count: MemoCount }
  }
}
