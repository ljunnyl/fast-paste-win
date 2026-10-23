// 감시 출력 해석·줄 나누기·입력칸 글·인코딩 시험 (가공 데이터만 사용)
import { test, expect } from 'claude-code/testing'

import { KEEP_COPIED, WATCH_SCRIPT, encodePs, findImageMentions, keepListPath, keyLabel, keyOf, keybindingsFor, missingImages, parseLine, pathsText, pickRequestPath, splitLines, viewRequestPath } from './core'

test('감시 출력 한 줄을 뜻으로 바꾼다', () => {
  expect(parseLine('READY\r')).toEqual({ kind: 'ready' })
  expect(parseLine('IMG C:\\T\\claude-fast-paste\\clip_7.png')).toEqual({ kind: 'image', path: 'C:\\T\\claude-fast-paste\\clip_7.png' })
  expect(parseLine('NOIMG')).toEqual({ kind: 'noimage' })
  expect(parseLine('PING')).toEqual({ kind: 'other' })
})

test('조각으로 온 출력을 완성된 줄만 꺼내고 나머지는 남긴다', () => {
  const a = splitLines('', 'REA')
  expect(a).toEqual({ lines: [], rest: 'REA' })
  const b = splitLines(a.rest, 'DY\r\nIMG C:\\x.png\r\nNO')
  expect(b).toEqual({ lines: ['READY', 'IMG C:\\x.png'], rest: 'NO' })
})

test('[보기] 쪽지는 그림과 같은 폴더의 view.req', () => {
  expect(viewRequestPath('C:\\T\\claude-fast-paste\\clip_7.png')).toBe('C:\\T\\claude-fast-paste\\view.req')
})

test('입력칸 글에서 이 모드가 넣은 그림 경로만 찾는다(다른 @파일은 제외, 같은 경로는 한 번)', () => {
  const win = 'C:\\U\\me\\.cfp\\85660\\3.png'
  const posix = 'C:/U/me/.cfp/85660/12.png'
  const text = `look @${win} and @${posix} again @${win} plus @README.md`
  expect(findImageMentions(text)).toEqual([win, posix])
})

test('스크립트는 ASCII 만 쓰고, 인코딩은 UTF-16LE base64', () => {
  expect(/^[\x00-\x7f]*$/.test(WATCH_SCRIPT)).toBe(true)
  expect(encodePs('ab')).toBe(btoa('a\0b\0'))
})

test('지우지 말 그림 목록은 그림과 같은 폴더의 keep.txt', () => {
  expect(keepListPath('C:\\U\\.cfp\\85660\\30.png')).toBe('C:\\U\\.cfp\\85660\\keep.txt')
})

test('보낼 글에서 파일이 없어진 그림 경로만 골라낸다', () => {
  const one = 'C:\\U\\.cfp\\1\\1.png'
  const two = 'C:\\U\\.cfp\\1\\2.png'
  const exists = (p: string) => p === one
  expect(missingImages(`@${one} @${two}`, exists)).toEqual([two])
  expect(missingImages(`@${one} only`, exists)).toEqual([])
})

test('감시 스크립트는 keep.txt 에 적힌 그림을 지우지 않는다', () => {
  expect(WATCH_SCRIPT.includes("$keep = Join-Path $dir 'keep.txt'")).toBe(true)
  expect(WATCH_SCRIPT.includes('Where-Object { $kp -notcontains $_.FullName } | Sort-Object LastWriteTime -Descending | Select-Object -Skip ' + KEEP_COPIED)).toBe(true)
  expect(KEEP_COPIED).toBe(40)
})

test('골라 붙이기 결과 PICK 줄을 경로 목록으로 바꾼다(취소면 빈 목록)', () => {
  expect(parseLine('PICK C:/a/1.png|C:/a/3.png\r')).toEqual({ kind: 'pick', paths: ['C:/a/1.png', 'C:/a/3.png'] })
  expect(parseLine('PICK ')).toEqual({ kind: 'pick', paths: [] })
  expect(pickRequestPath('C:/a/1.png')).toBe('C:/a/pick.req')
})

test('여러 장은 "@경로 " 를 이어 붙이고, 다시 찾으면 그대로 나온다', () => {
  const paths = Array.from({ length: 30 }, (_, i) => `C:\\U\\.cfp\\7\\${i + 1}.png`)
  const text = pathsText(paths)
  expect(text.startsWith(`@${paths[0]} @${paths[1]} `)).toBe(true)
  expect(findImageMentions(text)).toEqual(paths)
})

test('단축키 설정: 비면 기본값, 표시는 Alt+V 꼴, keybindings 조각은 alt+v 겹침 때만 Chat 항목을 넣는다', () => {
  expect(keyOf({}, 'pasteKey')).toBe('alt+v')
  expect(keyOf({ pasteKey: ' Alt+P ' }, 'pasteKey')).toBe('alt+p')
  expect(keyLabel('ctrl+shift+i')).toBe('Ctrl+Shift+I')
  const def = keybindingsFor({ pasteKey: 'alt+v', viewKey: 'alt+i', pasteAllKey: 'alt+a', pickKey: 'alt+g' })
  expect(def.bindings[0]).toEqual({ context: 'Chat', bindings: { 'alt+v': null, 'alt+shift+v': 'chat:imagePaste' } })
  expect(def.bindings[1]?.bindings['alt+g']).toBe('app:diffFileListDown')
  const moved = keybindingsFor({ pasteKey: 'alt+p', viewKey: 'alt+i', pasteAllKey: 'alt+a', pickKey: 'alt+g' })
  expect(moved.bindings.length).toBe(1)
  expect(moved.bindings[0]?.bindings['alt+p']).toBe('app:toggleReplTab')
})
