// 빠른 그림 붙여넣기: 세션 시작 때 클립보드 감시 PowerShell 을 하나 띄워 두고,
// 그림이 복사되면 미리 저장 → 입력창 위에 "image ready [Paste(Alt+V)] [View(Alt+I)]"
// → 붙이면 입력칸 커서 위치에 "@<저장된 PNG 경로> " 를 넣는다. Claude Code 가 평범한 "@파일" 언급으로 읽어 첨부한다.
// 원래 Alt+V(Claude 기본 붙여넣기)는 붙일 때마다 PowerShell 을 새로 띄워 이 PC에서 약 7초 걸린다(2026-10-20 감시 기록).
// ※ 0.2.x 까지는 "@imageN" 별명을 넣고 prompt.mention 에서 경로로 바꿨다. 플러그인 디렉터리가 그 이벤트를 아직 모르는
//   것으로 막아서(2026-10-23 포털 Validate), 0.3.0 부터 경로를 그대로 넣는다. 경로가 짧게 보이도록 감시가 ~/.cfp 밑에 저장한다
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ReadyImage } from '../types'
import { KEEP_COPIED, WATCH_SCRIPT, encodePs, keepListPath, missingImages, parseLine, pathsText, pickRequestPath, splitLines, viewRequestPath } from './core'

const ready = atom({ plugin: 'fast-paste-win', key: 'ready' } as const, null)
const pasted = atom({ plugin: 'fast-paste-win', key: 'pasted' } as const, [] as ReadyImage[])
const copied = atom({ plugin: 'fast-paste-win', key: 'copied' } as const, [] as ReadyImage[])
const recent = atom({ plugin: 'fast-paste-win', key: 'recent' } as const, [] as ReadyImage[])

// [View]: 감시 PowerShell 에 "이 그림 보여 줘" 쪽지(view.req)를 남긴다 → 그 PowerShell 이 0.25초 안에 창을 띄운다.
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
        if (w.kind === 'image') {
          await update($, ready, () => ({ path: w.path }))
          // 복사한 그림 목록에도 더한다. 감시가 붙이지 않은 그림은 KEEP_COPIED 장만 남기므로 목록도 그만큼만 둔다
          await update($, copied, list => [...list.filter(p => p.path !== w.path), { path: w.path }].slice(-KEEP_COPIED))
          // 골라 붙이기용: 보내도 비우지 않는 최근 복사 목록
          await update($, recent, list => [...list.filter(p => p.path !== w.path), { path: w.path }].slice(-KEEP_COPIED))
          // 상태줄에도 알린다: 띠가 접혀 있거나 가려져도 "준비됨"이 보이게
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

// 그림 여러 장을 입력칸 커서 위치에 "@경로 @경로 …" 로 한 번에 넣는다. 넣었으면 이번 메시지 목록에 더하고,
// "복사한 그림" 목록에서 빼고(같은 그림 두 번 방지), 준비된 그림이 그중에 있으면 준비 상태도 비운다.
// 보낼 때까지 지우지 말라고 감시에 알린다(keep.txt)
async function pasteMany($: EngineInterface, paths: string[]): Promise<void> {
  const first = paths[0]
  if (first === undefined) return
  const res = await $.prompt.fill({ text: pathsText(paths), mode: 'insert' })
  if (!res.isFilled) {
    $.ui.toast('Could not insert into the prompt')
    return
  }
  const r = await read($, ready)
  if (r && paths.includes(r.path)) {
    $.ui.status(undefined)
    await update($, ready, () => null)
  }
  const list = await update($, pasted, list => [...list, ...paths.map(path => ({ path }))])
  await update($, copied, list => list.filter(p => !paths.includes(p.path)))
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
    // 남은 상태가 없는 파일을 가리켜 붙이기·보기가 헛도는 일을 막으려고 비운다
    await update($, ready, () => null)
    await update($, pasted, () => [])
    await update($, copied, () => [])
    await update($, recent, () => [])
    void watch($)
    return started
  })

  // 보내기 직전: 글 속 그림 경로 중 파일이 없는 게 있으면 알림을 띄우고, Claude 에게도 빠졌다고 알려 사용자에게 말하게 한다
  //   (막지는 않는다: 보내기를 취소하면 입력한 글이 사라질 수 있어서)
  // 보낸 뒤: "이번 메시지에 붙인 그림"·"복사한 그림"·"지우지 말 그림" 목록을 비운다
  on('prompt.submit', async ($, e, next) => {
    let ev = e
    if (!e.command) {
      const ok = new Set<string>()
      for (const p of missingImages(e.text, () => false)) if (await $.fs.exists(p).catch(() => false)) ok.add(p)
      const miss = missingImages(e.text, p => ok.has(p))
      if (miss.length > 0) {
        $.ui.toast(`${miss.length} image(s) not found and dropped`)
        const note = `(fast-paste-win notice) The user pasted ${miss.length} image path(s) that no longer exist (${miss.join(', ')}), so they are not attached. Tell the user at the start of your reply that these images are missing.`
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

  // 입력창 위 띠(한 줄): 버튼은 전부 단축키로도 누른다
  //   보낸 뒤 복사한 그림이 2장 이상이면 "N copied [Paste all(Alt+A)]" — 보낸 뒤 새로 복사한 것만
  //   최근 복사한 그림이 2장 이상이면 [Pick(Alt+G)] — 보낸 것과 상관없이 최근 KEEP_COPIED 장 전부에서 고른다
  //   붙인 그림이 있으면 "N pasted", 준비된 그림이 있으면 [Paste(Alt+V)], 볼 그림이 있으면 [View(Alt+I)]
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
