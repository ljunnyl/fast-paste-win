// 감시 출력 해석·줄 나누기·입력칸 글·인코딩 시험 (가공 데이터만 사용)
import { test, expect } from 'claude-code/testing'

import { KEEP_COPIED, WATCH_SCRIPT, chipName, chipsText, pickRequestPath, chipOfMention, decorationsFor, encodePs, findChips, keepListPath, missingChips, parseLine, splitLines, viewRequestPath } from './core'

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

test('짧은 이름 "@imageN" 을 찾아 강조색을 칠하고, @ 뒤 글이 짧은 이름인지 가린다', () => {
  expect(chipName(2)).toBe('image2')
  const text = '이거 봐 @image1 그리고 @image2 끝 @README.md'
  expect(findChips(text).map(c => c.name)).toEqual(['image1', 'image2'])
  const d = decorationsFor(text)
  expect(d.length).toBe(4)
  expect(d[0]).toEqual({ start: 5, end: 5, virtualText: '[', color: 'suggestion', bold: true })
  expect(d[1]).toEqual({ start: 12, end: 12, virtualText: ']', color: 'suggestion', bold: true })
  expect(chipOfMention('image2')).toBe('image2')
  expect(chipOfMention('README.md')).toBe(null)
})

test('스크립트는 ASCII 만 쓰고, 인코딩은 UTF-16LE base64', () => {
  expect(/^[\x00-\x7f]*$/.test(WATCH_SCRIPT)).toBe(true)
  expect(encodePs('ab')).toBe(btoa('a\0b\0'))
})

test('지우지 말 그림 목록은 그림과 같은 폴더의 keep.txt', () => {
  expect(keepListPath('C:\\U\\.cfp\\85660\\30.png')).toBe('C:\\U\\.cfp\\85660\\keep.txt')
})

test('보낼 글에서 파일을 못 찾는 "@imageN" 만 골라낸다(대응표에 없거나 파일이 없는 것, 중복은 한 번)', () => {
  const chips = [{ name: 'image1', path: 'a.png' }, { name: 'image2', path: 'b.png' }]
  const exists = (p: string) => p === 'a.png'
  expect(missingChips('@image1 @image2 @image3 @image2', chips, exists)).toEqual(['image2', 'image3'])
  expect(missingChips('@image1 만', chips, exists)).toEqual([])
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

test('여러 장은 입력칸에 이미 있는 그림 다음 번호부터 이어 붙인다', () => {
  expect(chipsText(2, 3)).toEqual({ text: '@image3 @image4 @image5 ', names: ['image3', 'image4', 'image5'] })
  expect(findChips(chipsText(0, 30).text).length).toBe(30)
})
