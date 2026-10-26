# Fast Paste for Windows

**Instant clipboard-image paste for Claude Code on Windows.** Take a screenshot, press Alt+V, and the image is attached to your prompt immediately. No multi-second pause.

Windows only. Works with any tool that puts an image on the clipboard: Win+Shift+S, PrintScreen, Snipaste, ShareX, Paint, a browser, Excel.

한국어 안내는 아래 [한국어](#한국어) 절에 있습니다.

## Why

Claude Code's built-in image paste (Alt+V) launches a new PowerShell process every time you paste. On a corporate laptop with endpoint security that can take 5 to 7 seconds per image. This plugin keeps **one** PowerShell process alive for the whole session, watches the clipboard, and saves each new image to disk ahead of time. Pasting is then just inserting the saved file's `@path` into the prompt, which Claude Code attaches like any other mentioned file.

## What you get

A one-line band appears above the prompt whenever there is something to paste. Every button also has a shortcut.

| Button | Shortcut | What it does |
| --- | --- | --- |
| Paste | Alt+V | Insert the image you just copied |
| View / View all | Alt+I | Open the pasted image(s) in a window: ←/→ to move, number keys to enlarge one, Esc to close |
| Paste all | Alt+A | Insert every image copied since your last message, in order |
| Pick | Alt+G | Open a gallery of recent copies (up to 40), tick the ones you want, Enter to paste. Shift+click selects a range; the Range box takes `1-20,25` |

Pasted images show in the prompt as `@C:\Users\you\.cfp\12345\1.png` and so on: short on purpose, because the watcher saves under `~/.cfp`. When you send the message, Claude Code reads those PNG files. If a file has gone missing before sending, you get a toast and Claude is told which images were dropped.

![icon](.claude-plugin/icon.png)

## Install

```
/plugin install fast-paste-win --marketplace ljunnyl/fast-paste-win
```

Answer `y` to add the marketplace, then pick a scope.

### Choose your shortcuts (optional)

The four keys are plugin settings (`Paste shortcut`, `View shortcut`, `Paste-all shortcut`, `Pick shortcut`), shown when you install and later under `/config` → plugin settings. Defaults are Alt+V, Alt+I, Alt+A, Alt+G. Use Claude Code key syntax such as `alt+p` or `ctrl+shift+i`, and avoid keys Claude Code already uses. After changing a key, run the setup skill below again so the binding file matches.

### Register the shortcuts (required, once)

A mod cannot define new key bindings, so this plugin borrows four engine actions that are otherwise unused in the chat view. After installing, say **"set up fast-paste"** and the bundled `fast-paste-setup` skill reads your shortcut settings and writes the bindings for you. With the default keys the file it writes to `~/.claude/keybindings.json` is:

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

The built-in image paste moves to **Alt+Shift+V**. Restart Claude Code after editing the file.

## What the plugin runs and stores

This section describes everything the plugin executes, so you can decide whether it is right for your machine.

- **One process:** on session start the plugin spawns `powershell.exe -NoProfile -NonInteractive -Sta -EncodedCommand <script>`. The script is embedded in `hooks/core.ts` as readable text (`WATCH_SCRIPT`); the encoded form is just UTF-16 base64 of that text so quoting is not an issue. It uses only built-in Windows components: `System.Windows.Forms`, `System.Drawing`, and two `user32.dll` calls (`GetClipboardSequenceNumber`, `ShowWindow`/`SetForegroundWindow` to bring the viewer window to the front).
- **What it watches:** the clipboard change counter, four times a second. When the counter changes and the clipboard holds an image, the image is saved as PNG. Text and other clipboard contents are never read or stored.
- **Where files go:** `%USERPROFILE%\.cfp\<pid>\N.png`, one folder per session. Images that were copied but not pasted are trimmed to the most recent 40. Images pasted into the prompt are kept until the message is sent, then released. On start, the plugin deletes folders left by sessions whose process no longer exists, and ignores whatever was already on the clipboard.
- **Small request files** in the same folder (`view.req`, `pick.req`, `keep.txt`) carry instructions from the plugin to the watcher. They are deleted as soon as they are read.
- **Nothing leaves your machine.** The plugin makes no network requests. Images reach Claude only through the normal prompt attachment, the same way as the built-in paste.
- **Shutdown:** if Claude Code exits abnormally, the watcher's output pipe breaks and it exits itself within 10 seconds.

Screenshots may contain sensitive information. The `.cfp` folder is in your user profile; keep it out of cloud-sync or shared folders.

## Notes for reviewers: every call the mod makes

- `$.process.spawn` (hooks/register.tsx, `watch`): starts exactly one program, `powershell.exe`, with the fixed arguments `-NoProfile -NonInteractive -Sta -EncodedCommand <base64>`. The base64 is `encodePs(WATCH_SCRIPT)`: the plain-text script in `hooks/core.ts` encoded as UTF-16LE. No shell, no network tool, no package launcher. Nothing else is ever started.
- `$.fs.write` (`view`, `pick`, `saveKeep`): writes three request files, always in the watcher's own folder `%USERPROFILE%\.cfp\<pid>\`, always with the fixed names `view.req` (images to show), `pick.req` (images to offer in the picker) and `keep.txt` (images not to delete yet). Only the watcher script above reads them, and it deletes `view.req` and `pick.req` right after reading. No build, settings or instructions file is written.
- `$.fs.exists`: checks that a pasted PNG still exists before the message is sent.
- `$.prompt.fill`: inserts `@<saved PNG path> ` at the cursor. The user sees exactly what is inserted, and Claude Code attaches the file through its normal `@file` mention. No hook touches how the file is read.
- `prompt.submit` hook: reads the prompt text only to find `@…\.cfp\<pid>\<n>.png` mentions whose file is gone, shows a toast, and adds one plain-text note to the context so Claude tells the user which images are missing. It never blocks or rewrites the message.
- `ui.render`: the band above the prompt.
- Data leaving the mod: nothing goes anywhere but into the user's own prompt (the inserted text and the missing-image note). There are no HTTP calls, no `$.model` calls, no reads of the conversation beyond the prompt being typed.

## Requirements

- Windows 10 or 11 with Windows PowerShell 5 (preinstalled).
- Claude Code with mod (hooks module) support.
- macOS and Linux are not supported; the plugin shows a toast and does nothing.

## Development

```
claude plugin validate .
claude plugin test .
```

`hooks/core.ts` holds the watcher script and pure helpers (line parsing, name substitution, prompt decorations). `hooks/register.tsx` holds the session, submit and render hooks. Tests are in `hooks/*.test.ts(x)`.

## 한국어

Claude Code 에서 화면 캡처를 **바로** 붙이는 윈도우 전용 플러그인입니다. 세션이 켜질 때 PowerShell 하나를 띄워 두고 클립보드를 지켜보다가, 그림이 복사되면 미리 PNG 로 저장해 둡니다. Alt+V 를 누르면 그 파일 경로가 `@C:\Users\나\.cfp\12345\1.png` 처럼 입력칸에 들어가고, Claude Code 가 평범한 파일 언급으로 읽어 첨부합니다.

기본 붙여넣기(Alt+V)는 누를 때마다 PowerShell 을 새로 띄워 보안 프로그램이 깔린 회사 PC 에서는 5~7초씩 걸립니다. 이 플러그인은 이미 떠 있는 프로세스가 저장해 둔 파일을 쓰므로 바로 붙습니다.

| 버튼 | 단축키 | 동작 |
| --- | --- | --- |
| 붙이기 | Alt+V | 방금 복사한 그림 한 장을 넣는다 |
| 보기 / 모두 보기 | Alt+I | 붙인 그림을 창으로 크게 본다 (←/→ 이동, 숫자 키 확대, Esc 닫기) |
| 모두 붙이기 | Alt+A | 마지막 메시지 이후 복사한 그림 전부를 순서대로 넣는다 |
| 골라 붙이기 | Alt+G | 최근 복사한 그림(최대 40장)을 체크해서 고른 것만 넣는다. Shift+클릭이면 범위, 아래 Range 칸에 `1-20,25` 처럼 적어도 된다 |

설치 뒤 "fast-paste 설정해줘" 라고 하면 같이 들어 있는 `fast-paste-setup` 스킬이 단축키 파일을 써 줍니다. 기본 붙여넣기는 Alt+Shift+V 로 옮겨집니다.

그림은 `%USERPROFILE%\.cfp\<번호>\` 에 잠깐 저장됩니다. 복사만 한 그림은 최근 40장, 붙인 그림은 보낼 때까지만 남깁니다. 네트워크 요청은 없습니다. 캡처에 개인정보가 있을 수 있으니 이 폴더를 동기화하지 마세요.
