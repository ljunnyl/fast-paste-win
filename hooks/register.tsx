// 빠른 그림 붙여넣기: 세션 시작 때 클립보드 감시 PowerShell 을 하나 띄워 두고,
// 그림이 복사되면 미리 저장 → 입력창 위에 "그림 준비됨 [붙이기(Alt+V)] [보기(Alt+I)]"
// → 붙이면 입력칸 커서 위치에 짧은 "@그림n" 만 넣고, Claude 가 그 이름의 파일을 읽으려는 순간(prompt.mention)
//   진짜 그림 파일로 바꿔 읽게 한다. 입력칸에 경로가 안 보인다.
// 원래 Alt+V(Claude 기본 붙여넣기)는 붙일 때마다 PowerShell 을 새로 띄워 이 PC에서 약 7초 걸린다(2026-10-20 감시 기록).
// ※ 보낼 때(prompt.submit) 글을 경로로 바꾸는 방식은 실패했다: 첨부는 입력칸 글 기준이라 늦었다(2026-10-20 대화 기록 실측, 0장).
//   그래서 글은 "@그림n" 그대로 두고, 파일을 읽는 단계에서 경로만 바꾼다
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chip, ReadyImage } from '../types'
import { KEEP_COPIED, WATCH_SCRIPT, chipOfMention, chipsText, decorationsFor, encodePs, findChips, keepListPath, missingChips, parseLine, pickRequestPath, splitLines, viewRequestPath } from './core'

const ready = atom({ plugin: 'fast-paste-win', key: 'ready' } as const, null)
const pasted = atom({ plugin: 'fast-paste-win', key: 'pasted' } as const, [] as ReadyImage[])
const copied = atom({ plugin: 'fast-paste-win', key: 'copied' } as const, [] as ReadyImage[])
const recent = atom({ plugin: 'fast-paste-win', key: 'recent' } as const, [] as ReadyImage[])
const chips = atom({ plugin: 'fast-paste-win', key: 'chips' } as const, [] as Chip[])

// [보기]: 감시 PowerShell 에 "이 그림 보여 줘" 쪽지(view.req)를 남긴다 → 그 PowerShell 이 0.25초 안에 창을 띄운다.
// VS Code 탭(실측 34초)·사진 앱(새 프로그램이라 수 초)보다 빠르게 하려고, 이미 떠 있는 프로세스에 맡긴다(2026-10-20 실측)
// 쪽지 한 줄에 그림 하나: 한 장이면 크게, 여러 장이면 감시가 한 창에 모아 보여 준다
async function view($: EngineInterface, paths: string[]): Promise<void> {
  const first = paths[0]
  if (first === undefined) return
  try {
    await $.fs.write(viewRequestPath(first), paths.join('\n'))
  } catch {
    $.ui.toast('Could not open the image window')
  }
}

// 감시 PowerShell 에 "이 그림들은 보낼 때까지 지우지 마" 목록(keep.txt)을 써 준다(이번 메시지에 붙인 그림 전부).
// 빈 목록이면 비운다(보낸 뒤). 못 써도 붙이기는 그대로 진행한다 — 그때는 보내기 전 점검이 빠진 그림을 알려 준다
async function saveKeep($: EngineInterface, paths: string[], anyPath: string): Promise<void> {
  try {
    await $.fs.write(keepListPath(anyPath), paths.join('\n'))
  } catch {}
}

// 감시 PowerShell 을 띄우고 출력이 끝날 때까지(= 세션 내내) 읽는다. 모듈이 내려가면 엔진이 자식 프로세스를 끝낸다
async function watch($: EngineInterface): Promise<void> {
  let rest = ''
  try {
    const child = $.process.spawn({
      argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand', encodePs(WATCH_SCRIPT)],
    })
    for await (const { stream, text } of child) {
      if (stream !== 'stdout') continue
      const out = splitLines(rest, text)
      rest = out.rest
      for (const line of out.lines) {
        const w = parseLine(line)
        // 상태줄에도 같이 알린다: 띠가 접혀 있거나 가려져도 "준비됨"이 보이게(띠가 안 보인다는 신고를 가르려고 2026-10-20 추가)
        if (w.kind === 'image') {
          await update($, ready, () => ({ path: w.path }))
          // 복사한 그림 목록에도 더한다. 감시가 붙이지 않은 그림은 KEEP_COPIED 장만 남기므로 목록도 그만큼만 둔다(지워진 파일을 가리키지 않게)
          await update($, copied, list => [...list.filter(p => p.path !== w.path), { path: w.path }].slice(-KEEP_COPIED))
          // 골라 붙이기용: 보내도 비우지 않는 최근 복사 목록(2026-10-22: 보낸 뒤 비웠더니 18장 중 9장만 보여 사용자가 지적)
          await update($, recent, list => [...list.filter(p => p.path !== w.path), { path: w.path }].slice(-KEEP_COPIED))
          $.ui.status('🖼 image ready · Alt+V')
        } else if (w.kind === 'pick') {
          await pasteMany($, w.paths)
        } else if (w.kind === 'noimage') {
          await update($, ready, () => null)
          $.ui.status(undefined)
        } else if (w.kind === 'ready') $.ui.status(undefined)
      }
    }
    $.ui.toast('Fast paste watcher stopped. Built-in paste is Alt+Shift+V')
  } catch {
    $.ui.toast('Fast paste could not start (Windows PowerShell needed). Built-in paste is Alt+Shift+V')
  }
}

// 그림 여러 장을 입력칸 커서 위치에 "@그림n @그림n+1 …" 으로 한 번에 넣고(n = 입력칸에 이미 있는 그림 수 + 1),
// 이름↔파일을 대응표에 적는다. 넣었으면 이번 메시지 목록에 더하고, "복사한 그림" 목록에서 빼고(같은 그림 두 번 방지),
// 준비된 그림이 그중에 있으면 준비 상태도 비운다. 보낼 때까지 지우지 말라고 감시에 알린다(keep.txt)
async function pasteMany($: EngineInterface, paths: string[]): Promise<void> {
  const first = paths[0]
  if (first === undefined) return
  const before = await $.prompt.read().then(b => findChips(b.text).length).catch(() => 0)
  const { text, names } = chipsText(before, paths.length)
  const res = await $.prompt.fill({ text, mode: 'insert', decorations: decorationsFor(text) as never })
  if (!res.isFilled) {
    $.ui.toast('Could not insert into the prompt')
    return
  }
  const added = paths.map((path, i) => ({ name: names[i] ?? '', path }))
  const r = await read($, ready)
  if (r && paths.includes(r.path)) {
    $.ui.status(undefined)
    await update($, ready, () => null)
  }
  const list = await update($, pasted, list => [...list, ...paths.map(path => ({ path }))])
  await update($, copied, list => list.filter(p => !paths.includes(p.path)))
  await update($, chips, list => [...list.filter(c => !names.includes(c.name)), ...added])
  await saveKeep($, list.map(p => p.path), first)
}

// 준비된 그림 한 장 붙이기(Alt+V)
async function paste($: EngineInterface): Promise<void> {
  const r = await read($, ready)
  if (r) await pasteMany($, [r.path])
}

// 골라 붙이기: 감시 PowerShell 에 "복사한 그림들로 고르는 창 띄워 줘" 쪽지(pick.req)를 남긴다.
// 고른 결과는 감시 출력 "PICK …" 으로 돌아와 watch 가 pasteMany 로 넣는다
async function pick($: EngineInterface, paths: string[]): Promise<void> {
  const first = paths[0]
  if (first === undefined) return
  try {
    await $.fs.write(pickRequestPath(first), paths.join('\n'))
  } catch {
    $.ui.toast('Could not open the picker window')
  }
}

export const register: Register = on => {
  // 세션 시작: 감시를 백그라운드로 띄운다(끝날 때까지 기다리지 않음)
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // 다시 불러오기(/reload-plugins)에도 상태는 남는데, 새 감시가 시작하며 옛 그림 파일을 지운다.
    // 남은 상태가 없는 파일을 가리켜 붙이기·보기가 헛도는 일을 막으려고 비운다(2026-10-20 실제 발생)
    await update($, ready, () => null)
    await update($, pasted, () => [])
    await update($, copied, () => [])
    await update($, recent, () => [])
    await update($, chips, () => [])
    void watch($)
    return started
  })

  // Claude 가 "@그림n" 을 읽으려는 순간: 대응표에서 진짜 그림 파일을 찾아 그 파일을 대신 읽게 한다.
  // 대응표에 없는 이름이면 손대지 않는다(그냥 "그림n" 이라는 파일을 찾다가 없으면 첨부 안 됨)
  on('prompt.mention', async ($, e, next) => {
    const name = chipOfMention(e.mention)
    if (!name) return next(e)
    const hit = (await read($, chips)).find(c => c.name === name)
    return hit ? next({ ...e, path: hit.path }) : next(e)
  })

  // 입력칸을 고칠 때마다 꾸미기를 다시 칠한다(엔진은 다음 편집 때 꾸미기를 지우므로). 번호는 입력칸 안 순서대로 매긴다
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const mine = decorationsFor(r.text)
    if (mine.length === 0) return r
    return { ...r, decorations: [...(r.decorations ?? []), ...(mine as never[])] }
  })

  // 보내기 직전: 글 속 "@그림n" 중 파일을 못 찾는 게 있으면 알림을 띄우고, Claude 에게도 빠졌다고 알려 사용자에게 말하게 한다
  //   (막지는 않는다: 보내기를 취소하면 입력한 글이 사라질 수 있어서. 예전엔 빠져도 아무 표시가 없었다 — 2026-10-21 36장 중 26장 누락)
  // 보낸 뒤: "이번 메시지에 붙인 그림"·"복사한 그림"·"지우지 말 그림" 목록을 비운다(보낸 뒤까지 띠가 남지 않게,
  //   다음 "모두 붙이기"에는 보낸 뒤 새로 복사한 그림만 들어가게)
  on('prompt.submit', async ($, e, next) => {
    let ev = e
    if (!e.command && findChips(e.text).length > 0) {
      const map = await read($, chips)
      const ok = new Set<string>()
      for (const c of map) if (await $.fs.exists(c.path).catch(() => false)) ok.add(c.path)
      const miss = missingChips(e.text, map, p => ok.has(p))
      if (miss.length > 0) {
        $.ui.toast(`${miss.length} image(s) not found and dropped: ${miss.join(', ')}`)
        const note = `(fast-paste-win notice) The user pasted ${miss.join(', ')} but those image files could not be found, so they are not attached. Tell the user at the start of your reply that these images are missing.`
        ev = { ...e, context: [...(e.context ?? []), note] }
      }
    }
    const sent = await next(ev)
    const list = await read($, pasted)
    await update($, pasted, () => [])
    await update($, copied, () => [])
    if (list[0]) await saveKeep($, [], list[0].path)
    return sent
  })

  // 입력창 위 띠(한 줄): 버튼은 전부 단축키로도 누른다(2026-10-22 사용자 요청: 한 줄로, 모든 버튼 단축키)
  //   보낸 뒤 복사한 그림이 2장 이상이면 "복사한 그림 N장 [모두 붙이기(Alt+A)]" — 보낸 뒤 새로 복사한 것만(이미 보낸 그림이 또 들어가지 않게)
  //   최근 복사한 그림이 2장 이상이면 [골라 붙이기(Alt+G)] — 보낸 것과 상관없이 최근 KEEP_COPIED 장 전부에서 고른다
  //     — Snipaste 등에서 캡처마다 복사해 둔 그림을 한 번에 넣는다(2026-10-21 사용자 요청: 30장 정도를 한 번에)
  //   붙인 그림이 있으면 "붙인 그림 N장" (번호 버튼은 단축키를 줄 수 없어 뺐다. 낱장은 보기(Alt+I) 창에서 숫자 키로 연다)
  //   준비된 그림이 있으면 [붙이기(Alt+V)], 볼 그림이 있으면 [보기(Alt+I)]
  //   보기(Alt+I)는 이번 메시지에 붙인 그림이 있으면 전부를 한 창에(2장 이상이면 "모두 보기"), 없으면 준비된 그림을 연다
  // 버튼이 화면에 있어야 단축키가 이 모드로 온다(띠가 접혀 있으면 단축키도 안 먹음)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, ready)
    const list = await read($, pasted)
    const cp = await read($, copied)
    const rc = await read($, recent)
    const targets = list.length > 0 ? list.map(p => p.path) : r ? [r.path] : []
    const many = cp.length >= 2
    const canPick = rc.length >= 2
    if (e.props.hasSurvey || (targets.length === 0 && !many && !canPick)) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const cpPaths = cp.map(p => p.path)
    const rcPaths = rc.map(p => p.path)
    // action: 모드는 새 단축키 동작을 못 만들어, 평소 화면에서 안 쓰는 엔진 동작을 빌리고 ~/.claude/keybindings.json 에서 키를 묶었다
    //   Alt+V → app:toggleReplTab (기본 붙여넣기는 Alt+Shift+V 로 옮김) / Alt+I → app:toggleDiffPreSession
    //   Alt+A → app:cycleDiffBase / Alt+G → app:diffFileListDown (둘 다 변경 비교 창 안에서만 쓰는 동작)
    return (
      <Box justifyContent="flex-end">
        <Text dimColor>🖼 </Text>
        {many && <Text dimColor>{cp.length} copied </Text>}
        {many && <Button key="paste-all" action="app:cycleDiffBase" label="Paste all (Alt+A)" onPress={() => pasteMany($, cpPaths)} />}
        {many && canPick && <Text> </Text>}
        {canPick && <Button key="pick" action="app:diffFileListDown" label="Pick (Alt+G)" onPress={() => pick($, rcPaths)} />}
        {(many || canPick) && targets.length > 0 && <Text dimColor> · </Text>}
        {list.length > 0 && <Text dimColor>{list.length} pasted </Text>}
        {r !== null && <Button key="paste" action="app:toggleReplTab" label="Paste (Alt+V)" onPress={() => paste($)} />}
        {r !== null && targets.length > 0 && <Text> </Text>}
        {targets.length > 0 && (
          <Button key="view" action="app:toggleDiffPreSession" label={targets.length > 1 ? 'View all (Alt+I)' : 'View (Alt+I)'} onPress={() => view($, targets)} />
        )}
      </Box>
    )
  })
}
