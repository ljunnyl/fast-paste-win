// 그림 하나: 저장된 파일 경로(path)
export type ReadyImage = { path: string }

declare module 'claude-code' {
  interface PluginState {
    'fast-paste-win': {
      // 붙일 준비가 된 그림. 붙였거나 클립보드가 그림이 아니게 되면 null
      ready: ReadyImage | null
      // 이번 메시지에 붙인 그림들(모아 보기용). 메시지를 보내면 비운다
      pasted: ReadyImage[]
      // 지난번 보낸 뒤 복사했지만 아직 붙이지 않은 그림들(복사한 순서, 최대 KEEP_COPIED 장). "Paste all" 용. 보내면 비운다
      copied: ReadyImage[]
      // 최근 복사한 그림들(보내도 비우지 않음, 최대 KEEP_COPIED 장). "Pick" 용. 세션을 새로 시작하면 비운다
      recent: ReadyImage[]
    }
  }
}
