---
name: fast-paste-setup
description: fast-paste-win(빠른 그림 붙여넣기) 설치 뒤 단축키 등록·동작 확인. "set up fast-paste", "fast-paste 설정해줘", "그림 붙여넣기 단축키 등록", "Alt+V 가 안 돼", "단축키 바꿨어" 요청에 사용.
---

# fast-paste-win 설치 마무리 (shortcut setup)

이 모드는 새 단축키를 직접 만들 수 없어 엔진의 안 쓰는 동작 4개를 빌린다. 사용자가 고른 키를 그 동작에 묶는 일을 여기서 한다. 설치 직후 한 번, 그리고 단축키 설정을 바꿀 때마다 다시 한다.

## 1. 사용자가 고른 키 읽기

`~/.claude/settings.json` 을 읽어 `pluginConfigs` 아래 `fast-paste-win` 항목을 찾는다(없거나 칸이 비어 있으면 기본값).

| 설정 칸 | 기본값 | 역할 |
|---|---|---|
| `pasteKey` | `alt+v` | 붙이기 |
| `viewKey` | `alt+i` | 보기 |
| `pasteAllKey` | `alt+a` | 모두 붙이기 |
| `pickKey` | `alt+g` | 골라 붙이기 |

키는 소문자·공백 없음으로 정리한다. 두 칸이 같은 키면 사용자에게 알리고 멈춘다.

## 2. keybindings.json 쓰기

`~/.claude/keybindings.json` 을 읽는다. 없으면 새로 만든다. 있으면 `bindings` 배열에 아래 항목을 합치되, 예전에 이 스킬이 넣은 fast-paste 키(아래 네 동작으로 묶인 줄)는 지우고 다시 넣는다. 다른 플러그인·사용자 줄은 건드리지 않는다. 사용자가 고른 키가 이미 다른 동작에 묶여 있으면 어느 쪽을 쓸지 묻는다.

각 키를 이 엔진 동작에 묶는다(동작 이름은 고정):

| 설정 칸 | 엔진 동작 |
|---|---|
| `pasteKey` | `app:toggleReplTab` |
| `viewKey` | `app:toggleDiffPreSession` |
| `pasteAllKey` | `app:cycleDiffBase` |
| `pickKey` | `app:diffFileListDown` |

네 키 중 하나라도 `alt+v` 이면 Claude 기본 그림 붙여넣기와 겹치므로 `Chat` 문맥에서 `alt+v` 를 비우고 기본 붙여넣기를 `alt+shift+v` 로 옮긴다. 기본값 그대로일 때 결과는 이렇다:

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

쓴 뒤 사용자에게 네 키와 "기본 붙여넣기는 Alt+Shift+V" 를 한 줄로 알린다.

## 3. 조건 확인

- 윈도우여야 한다. `powershell.exe` 가 PATH 에 있는지 확인한다(Windows PowerShell 5, 기본 포함).
- 맥·리눅스면 이 모드는 동작하지 않는다고 알리고 끝낸다.

## 4. 동작 확인

1. Claude Code 를 다시 시작하게 한다(단축키 파일은 시작할 때 읽는다).
2. 아무 화면이나 캡처해 클립보드에 복사하면 입력창 위에 「🖼 Paste (키)」 띠가 뜬다. 띠의 괄호 안 키가 설정과 같은지 본다.
3. 붙이기 키를 누르면 입력칸에 `@C:\Users\…\.cfp\<번호>\1.png` 가 들어간다. 그대로 보내면 Claude 가 그 그림을 읽는다.

띠가 안 뜨면: 그림이 `~/.cfp/<번호>/` 에 저장되는지 본다. 저장은 되는데 띠가 없으면 모드가 안 켜진 것이니 `/plugin` 에서 fast-paste-win 이 켜져 있는지 확인한다. 띠는 뜨는데 키가 안 먹으면 keybindings.json 의 키와 띠의 키가 같은지 본다.

## 주의

그림은 `~/.cfp/` 에 잠깐 저장된다(복사만 한 것은 최근 40장, 붙인 것은 보낼 때까지). 캡처에 개인정보가 있을 수 있으니 이 폴더를 동기화하지 않게 안내한다.
