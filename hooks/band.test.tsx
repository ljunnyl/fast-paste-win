// 띠 그리기 시험: 감시가 "그림 저장함"을 알리면 띠에 [붙이기]·[보기] 버튼이 그려지는지 (가짜 감시·가짜 경로만 사용)
import { test, expect } from 'claude-code/testing'

test('감시가 IMG 를 알리면 띠에 붙이기·보기 버튼이 그려진다', async ($, on) => {
  // 감시 PowerShell 대신: 준비 신호와 그림 한 장을 알리고 끝나는 가짜 출력
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: 'READY\r\nIMG C:\\fake\\claude-fast-paste\\1\\clip_1.png\r\n' }
    return { value: { code: 0, signal: null } }
  } as never)
  on('ui.toast', async () => ({ value: undefined }))
  // 모드가 그리지 않을 때 엔진이 대신 그리는 자리 — 시험에선 빈 글자
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{''}</Text>
  })
  on('session.start', async (_$, e) => e as never)

  await $.session.start({ source: 'startup', cwd: 'C:/fake', sessionId: 'test' } as never)
  // 가짜 감시 출력이 상태에 반영될 때까지 잠깐 양보
  for (let i = 0; i < 20; i++) await Promise.resolve()

  const band = await $.ui.mount({ plugin: 'fast-paste-win', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never })
  // 감시 출력이 비동기로 들어오므로, 버튼이 그려질 때까지 잠깐씩 기다리며 다시 본다
  let found = await band.find({ key: 'paste' })
  for (let i = 0; i < 50 && !found; i++) {
    await new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 20))
    found = await band.find({ key: 'paste' })
  }
  expect(found).toBeDefined()
  expect(await band.find({ key: 'view' })).toBeDefined()
  await band.unmount()
})

test('복사한 그림이 2장 이상이면 띠 윗줄에 모두 붙이기·골라 붙이기 버튼이 그려진다', async ($, on) => {
  // 가짜 감시 출력: 그림 3장을 복사했다고 알린다
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: ['READY', 'IMG C:/fake/1.png', 'IMG C:/fake/2.png', 'IMG C:/fake/3.png', ''].join('\r\n') }
    return { value: { code: 0, signal: null } }
  } as never)
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{''}</Text>
  })
  on('session.start', async (_$, e) => e as never)

  await $.session.start({ source: 'startup', cwd: 'C:/fake', sessionId: 'test' } as never)
  for (let i = 0; i < 20; i++) await Promise.resolve()

  const band = await $.ui.mount({ plugin: 'fast-paste-win', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never })
  let found = await band.find({ key: 'paste-all' })
  for (let i = 0; i < 50 && !found; i++) {
    await new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 20))
    found = await band.find({ key: 'paste-all' })
  }
  expect(found).toBeDefined()
  expect(await band.find({ key: 'pick' })).toBeDefined()
  expect(await band.find({ key: 'paste' })).toBeDefined()
  await band.unmount()
})
