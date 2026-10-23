// 그림 하나: 저장된 파일 경로(path)
export type ReadyImage = { path: string }

// 입력칸의 짧은 이름 하나: "그림n"(name) ↔ 실제 그림 파일(path)
export type Chip = { name: string; path: string }

declare module 'claude-code' {
  interface PluginState {
    'fast-paste-win': {
      // 붙일 준비가 된 그림. 붙였거나 클립보드가 그림이 아니게 되면 null
      ready: ReadyImage | null
      // 이번 메시지에 붙인 그림들(띠의 [1] [2] … · 모아 보기용). 메시지를 보내면 비운다
      pasted: ReadyImage[]
      // 지난번 보낸 뒤 복사했지만 아직 붙이지 않은 그림들(복사한 순서, 최대 KEEP_COPIED 장). "모두 붙이기" 용. 보내면 비운다
      copied: ReadyImage[]
      // 최근 복사한 그림들(보내도 비우지 않음, 최대 KEEP_COPIED 장). "골라 붙이기" 용. 세션을 새로 시작하면 비운다
      recent: ReadyImage[]
      // "그림n" → 실제 파일 대응표. Claude 가 "@그림n" 을 읽을 때 진짜 파일로 바꿔 주는 데 쓴다.
      // 보낼 때 비우지 않는다(보낸 뒤 첨부 처리가 끝나기 전에 비우면 못 찾으니까). 같은 이름을 다시 쓰면 새 그림으로 덮는다
      chips: Chip[]
    }
  }
}
