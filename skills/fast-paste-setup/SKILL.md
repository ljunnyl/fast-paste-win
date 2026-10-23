---
name: fast-paste-setup
description: fast-paste(빠른 그림 붙여넣기) 모드 설치 뒤 단축키 등록·동작 확인. "fast-paste 설정해줘", "그림 붙여넣기 단축키 등록", "Alt+V 가 안 돼" 요청에 사용.
---

# fast-paste 설치 마무리

이 모드는 새 단축키를 직접 만들 수 없어 엔진의 안 쓰는 동작을 빌린다. 설치 뒤 아래를 한 번 해 준다.

## 1. 단축키 등록

`~/.claude/keybindings.json` 을 읽는다. 없으면 아래 내용으로 새로 만든다. 이미 있으면 `bindings` 배열에 아래 두 항목을 합친다(같은 키가 이미 있으면 사용자에게 어느 쪽을 쓸지 묻는다).

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "alt+v": null, "alt+shift+v": "chat:imagePaste" } },
    {
      "context": "Global",
      "bindings": {
        "alt+v": "app:toggleReplTab",
        "alt+i": "app:toggleDiffPreSession",
        "alt+a": "app:cycleDiffBase",
        "alt+g": "app:diffFileListDown"
      }
    }
  ]
}
```

- Alt+V = 붙이기, Alt+I = 보기, Alt+A = 모두 붙이기, Alt+G = 골라 붙이기
- 기본 그림 붙여넣기는 Alt+Shift+V 로 옮겨진다고 사용자에게 알린다.

## 2. 조건 확인

- 윈도우여야 한다. `powershell.exe` 가 PATH 에 있는지 확인한다(Windows PowerShell 5, 기본 포함).
- 맥·리눅스면 이 모드는 동작하지 않는다고 알리고 끝낸다.

## 3. 동작 확인

1. Claude Code 를 다시 시작하게 한다(단축키 파일은 시작할 때 읽는다).
2. 아무 화면이나 캡처해 클립보드에 복사하면 입력창 위에 「🖼 Paste (Alt+V)」 띠가 뜬다.
3. Alt+V 를 누르면 입력칸에 `[@image1]` 이 들어간다. 그대로 보내면 Claude 가 그 그림을 읽는다.

띠가 안 뜨면: 그림이 `~/.cfp/<번호>/` 에 저장되는지 본다. 저장은 되는데 띠가 없으면 모드가 안 켜진 것이니 `/plugin` 에서 fast-paste 가 켜져 있는지 확인한다.

## 주의

그림은 `~/.cfp/` 에 잠깐 저장된다(복사만 한 것은 최근 40장, 붙인 것은 보낼 때까지). 캡처에 개인정보가 있을 수 있으니 이 폴더를 동기화하지 않게 안내한다.
