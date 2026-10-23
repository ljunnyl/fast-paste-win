// 클립보드 감시 PowerShell 스크립트와, 그 출력 한 줄을 해석하는 순수 함수들 (화면·프로세스 없음 → 테스트하기 쉬움)

// 감시 스크립트 본문. 세션 시작 때 한 번만 띄워 세션 내내 살려 둔다(이 PC는 PowerShell 한 번 띄우는 데 3~4초라서).
// - 클립보드 "변경 번호"(GetClipboardSequenceNumber)만 0.25초마다 확인 → 바뀌었을 때만 그림인지 보고, 그림이면 PNG 로 저장
// - 저장한 그림은 최근 KEEP_COPIED(40)장만 남기고 지운다(회사 화면 캡처에 개인정보가 있을 수 있어 디스크에 오래 두지 않으려고).
//   단 입력칸에 붙여 둔 그림(keep.txt)은 보낼 때까지 남긴다
// - 시작할 때 지난 세션이 남긴 그림을 지우고, 시작 시점에 이미 클립보드에 있던 그림은 무시한다(켤 때마다 띠가 뜨지 않게)
// - Claude 가 비정상 종료돼 출력 통로가 끊기면 10초 안에 쓰기가 실패하므로 그때 스스로 끝난다(고아 프로세스 방지)
// 인코딩 문제를 피하려고 스크립트는 ASCII 만 쓴다(주석은 이 TS 파일에만 한글로 둔다)
// 근거(0.25초 / 10초 / 10장): 추정값. 0.25초는 "누르자마자" 체감에 충분한 간격, 10초는 고아 감지 지연 허용치,
//   KEEP_COPIED 는 붙이지 않고 복사만 한 그림의 보관 개수(붙인 그림은 개수 제한 없이 keep.txt 로 지킨다). 재판정: 붙여넣기 체감·임시 폴더 크기를 보고 조정
// 붙이지 않고 복사만 한 그림을 몇 장까지 남길지. "복사한 그림 모두 붙이기"가 Snipaste 캡처 30장 안팎을 한 번에 넣을 수 있게
// 10 → 40 으로 올렸다(2026-10-21 사용자 요청: 30장 정도). 개인정보 노출 기간과 맞바꾼 값이라 필요 이상 올리지 않는다
export const KEEP_COPIED = 40

export const WATCH_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  // ShowWindow·SetForegroundWindow: Claude 는 이 PowerShell 을 "창 숨김"으로 띄워서, 윈도우가 이 프로세스의 첫 창을 숨긴다.
  // [보기] 창이 뜬 직후 한 번 더 "보이게(5=SW_SHOW)" 해야 실제로 보인다(2026-10-20 숨김 실행으로 재현·확인)
  `Add-Type -Name U -Namespace FastPaste -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);'`,
  // 세션(감시 프로세스)마다 자기 폴더(claude-fast-paste\<PID>)를 쓴다. 터미널 여러 개가 동시에 돌 때
  // 같은 파일을 서로 덮어쓰거나, 새 세션이 남의 그림을 지우는 일을 막으려고(2026-10-20 동시 2개 실측)
  // 입력칸에 넣는 경로를 짧게 하려고 홈 바로 밑 짧은 폴더(~/.cfp)를 쓴다(임시 폴더 경로는 70자가 넘었다, 2026-10-20)
  "$base = Join-Path $env:USERPROFILE '.cfp'",
  '$dir = Join-Path $base $PID',
  'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
  // 꺼진 세션이 남긴 폴더(그 PID 의 프로세스가 없는 것)와 옛 방식으로 바로 밑에 둔 파일(그림·쪽지)을 치운다
  "Get-ChildItem $base -File | Remove-Item -Force",
  "Get-ChildItem $base -Directory | Where-Object { $_.Name -match '^[0-9]+$' -and -not (Get-Process -Id ([int]$_.Name) -ErrorAction SilentlyContinue) } | Remove-Item -Recurse -Force",
  '$last = [FastPaste.U]::GetClipboardSequenceNumber()',
  // 파일 이름도 짧게: 이 감시가 저장한 순서대로 1.png, 2.png ...
  '$n = 0',
  '$beat = Get-Date',
  "function Say($t) { try { [Console]::Out.WriteLine($t); [Console]::Out.Flush() } catch { exit 0 } }",
  // 그림 파일을 메모리로 읽는다(FromFile 은 창이 닫힐 때까지 파일을 잠가 "10장만 남기기" 삭제가 막힌다)
  'function Load-Img($p) { [System.Drawing.Image]::FromStream((New-Object System.IO.MemoryStream (,[System.IO.File]::ReadAllBytes($p)))) }',
  // 크게 보기 창: 이미 떠 있는 이 PowerShell 안에서 창을 직접 띄운다(새 프로그램을 안 띄워 이 PC에서도 바로 뜬다)
  // 화면의 80% 안에 맞춰 보여 준다. 키보드: ←/→ 이전·다음 그림, Esc 닫기(모아 보기에서 왔으면 모아 보기로 돌아감). 클릭해도 닫힘
  // 창이 열려 있는 동안은 클립보드 감시가 잠시 멈춘다
  'function Show-Image($paths, $idx) {',
  '  $paths = @($paths | Where-Object { Test-Path -LiteralPath $_ })',
  '  if ($paths.Count -eq 0) { return }',
  // 핸들러 안에서 바꿀 값은 해시표에 둔다(PowerShell 이벤트 블록 안의 대입은 바깥 변수를 바꾸지 못해서)
  '  $st = @{ i = [Math]::Max(0, [Math]::Min($idx, $paths.Count - 1)) }',
  '  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea',
  '  $f = New-Object System.Windows.Forms.Form',
  "  $f.StartPosition = 'CenterScreen'; $f.TopMost = $true; $f.KeyPreview = $true; $f.ImeMode = 'Disable'",
  "  $pb = New-Object System.Windows.Forms.PictureBox; $pb.Dock = 'Fill'; $pb.SizeMode = 'Zoom'",
  '  $f.Controls.Add($pb)',
  '  $load = {',
  '    if ($pb.Image) { $pb.Image.Dispose() }',
  '    $img = Load-Img $paths[$st.i]; $pb.Image = $img',
  '    $k = [Math]::Min(1.0, [Math]::Min(($wa.Width * 0.8) / $img.Width, ($wa.Height * 0.8) / $img.Height))',
  '    $f.ClientSize = New-Object System.Drawing.Size ([int]($img.Width * $k)), ([int]($img.Height * $k))',
  "    $f.Text = 'Image ' + ($st.i + 1) + ' / ' + $paths.Count + '   (Left/Right: move, Esc: close)'",
  '  }',
  '  & $load',
  "  $f.Add_KeyDown({ if ($_.KeyCode -eq 'Escape') { $f.Close() } elseif ($_.KeyCode -eq 'Right' -and $st.i -lt $paths.Count - 1) { $st.i++; & $load } elseif ($_.KeyCode -eq 'Left' -and $st.i -gt 0) { $st.i--; & $load } })",
  '  $pb.Add_Click({ $f.Close() })',
  '  $f.Add_Shown({ [void][FastPaste.U]::ShowWindow($f.Handle, 5); [void][FastPaste.U]::SetForegroundWindow($f.Handle); $f.Activate() })',
  '  [void]$f.ShowDialog(); if ($pb.Image) { $pb.Image.Dispose() }; $f.Dispose()',
  '}',
  // 모아 보기(Alt+I): 이번 메시지에 붙인 그림을 번호와 함께 한 창에 나란히 보여 준다
  // 키보드: 숫자 1~9 = 그 번호 크게 보기(크게 보기에서 Esc 면 다시 여기로), Esc = 닫기. 클릭해도 크게 보기
  'function Show-Gallery($paths) {',
  '  $paths = @($paths | Where-Object { Test-Path -LiteralPath $_ })',
  '  if ($paths.Count -eq 0) { return }',
  '  $f = New-Object System.Windows.Forms.Form',
  "  $f.Text = 'Images (' + $paths.Count + ')   (1-9: enlarge, Esc: close)'",
  "  $f.StartPosition = 'CenterScreen'; $f.TopMost = $true; $f.KeyPreview = $true; $f.ImeMode = 'Disable'",
  '  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea',
  '  $cols = [Math]::Min(3, $paths.Count); $rows = [Math]::Ceiling($paths.Count / $cols)',
  '  $f.ClientSize = New-Object System.Drawing.Size ([Math]::Min($wa.Width * 0.8, $cols * 336 + 20)), ([Math]::Min($wa.Height * 0.8, $rows * 284 + 20))',
  "  $flow = New-Object System.Windows.Forms.FlowLayoutPanel; $flow.Dock = 'Fill'; $flow.AutoScroll = $true",
  '  $f.Controls.Add($flow)',
  '  for ($i = 0; $i -lt $paths.Count; $i++) {',
  '    $box = New-Object System.Windows.Forms.Panel; $box.Size = New-Object System.Drawing.Size 326, 274',
  "    $lb = New-Object System.Windows.Forms.Label; $lb.Text = [string]($i + 1); $lb.Dock = 'Top'; $lb.Height = 22; $lb.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)",
  "    $pb = New-Object System.Windows.Forms.PictureBox; $pb.Dock = 'Fill'; $pb.SizeMode = 'Zoom'; $pb.Cursor = 'Hand'; $pb.Tag = $i",
  '    $pb.Image = Load-Img $paths[$i]',
  '    $pb.Add_Click({ Show-Image $paths $this.Tag })',
  '    $box.Controls.Add($pb); $box.Controls.Add($lb); $flow.Controls.Add($box)',
  '  }',
  // 숫자 키: 윗줄(키 번호 49~57)과 숫자 패드(97~105) 둘 다. 키 이름(D2 등) 대신 번호로 본다 —
  // 한글 입력기가 켜져 있으면 숫자가 다른 키 이름으로 들어온 적이 있어서(2026-10-20 시험). 창의 입력기도 끈다
  "  $f.Add_KeyDown({ if ($_.KeyCode -eq 'Escape') { $f.Close(); return }; $v = $_.KeyValue; $n = 0; if ($v -ge 49 -and $v -le 57) { $n = $v - 48 } elseif ($v -ge 97 -and $v -le 105) { $n = $v - 96 }; if ($n -ge 1 -and $n -le $paths.Count) { $_.Handled = $true; Show-Image $paths ($n - 1) } })",
  '  $f.Add_Shown({ [void][FastPaste.U]::ShowWindow($f.Handle, 5); [void][FastPaste.U]::SetForegroundWindow($f.Handle); $f.Activate() })',
  '  [void]$f.ShowDialog(); foreach ($c in $flow.Controls) { foreach ($x in $c.Controls) { if ($x.Image) { $x.Image.Dispose() } } }; $f.Dispose()',
  '}',
  // 골라 붙이기 창: 복사한 그림을 번호·체크칸과 함께 나란히 보여 주고, 고른 것만 "PICK 경로|경로|..." 한 줄로 알린다.
  // 그림이나 체크칸을 누르면 고름/안 고름이 바뀐다. Enter 또는 [Paste] = 붙이기, A = 전부 고르기/전부 풀기, Esc = 취소(빈 PICK)
  'function Show-Picker($paths) {',
  '  $paths = @($paths | Where-Object { Test-Path -LiteralPath $_ })',
  "  if ($paths.Count -eq 0) { Say 'PICK '; return }",
  '  $f = New-Object System.Windows.Forms.Form',
  "  $f.Text = 'Pick images (' + $paths.Count + ')   (click: select, A: all, Enter: paste, Esc: cancel)'",
  "  $f.StartPosition = 'CenterScreen'; $f.TopMost = $true; $f.KeyPreview = $true; $f.ImeMode = 'Disable'",
  '  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea',
  '  $cols = [Math]::Min(4, $paths.Count); $rows = [Math]::Ceiling($paths.Count / $cols)',
  '  $f.ClientSize = New-Object System.Drawing.Size ([Math]::Min($wa.Width * 0.85, $cols * 256 + 30)), ([Math]::Min($wa.Height * 0.85, $rows * 214 + 70))',
  "  $flow = New-Object System.Windows.Forms.FlowLayoutPanel; $flow.Dock = 'Fill'; $flow.AutoScroll = $true",
  "  $bar = New-Object System.Windows.Forms.Panel; $bar.Dock = 'Bottom'; $bar.Height = 44",
  "  $ok = New-Object System.Windows.Forms.Button; $ok.Text = 'Paste (Enter)'; $ok.Width = 140; $ok.Height = 32; $ok.Top = 6; $ok.Left = 10",
  "  $cnt = New-Object System.Windows.Forms.Label; $cnt.Left = 160; $cnt.Top = 13; $cnt.Width = 300; $cnt.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
  '  $bar.Controls.Add($ok); $bar.Controls.Add($cnt)',
  '  $f.Controls.Add($flow); $f.Controls.Add($bar)',
  '  $checks = New-Object System.Collections.ArrayList',
  "  $count = { $k = @($checks | Where-Object { $_.Checked }).Count; $cnt.Text = [string]$k + ' selected' }",
  '  for ($i = 0; $i -lt $paths.Count; $i++) {',
  '    $box = New-Object System.Windows.Forms.Panel; $box.Size = New-Object System.Drawing.Size 246, 204',
  "    $cb = New-Object System.Windows.Forms.CheckBox; $cb.Text = [string]($i + 1); $cb.Dock = 'Top'; $cb.Height = 24; $cb.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)",
  '    $cb.Add_CheckedChanged({ & $count })',
  "    $pb = New-Object System.Windows.Forms.PictureBox; $pb.Dock = 'Fill'; $pb.SizeMode = 'Zoom'; $pb.Cursor = 'Hand'; $pb.Tag = $cb",
  '    $pb.Image = Load-Img $paths[$i]',
  '    $pb.Add_Click({ $this.Tag.Checked = -not $this.Tag.Checked })',
  '    [void]$checks.Add($cb); $box.Controls.Add($pb); $box.Controls.Add($cb); $flow.Controls.Add($box)',
  '  }',
  '  & $count',
  // 핸들러 안에서 바꿀 값은 해시표에 둔다(이벤트 블록 안의 대입은 바깥 변수를 바꾸지 못해서)
  '  $st = @{ done = $false }',
  '  $ok.Add_Click({ $st.done = $true; $f.Close() })',
  // A 키: 하나라도 안 골랐으면 전부 고르고, 전부 골랐으면 전부 푼다. 키 번호(65)로 본다 — 한글 입력기 대비(Show-Gallery 와 같은 이유)
  "  $f.Add_KeyDown({ if ($_.KeyCode -eq 'Escape') { $f.Close() } elseif ($_.KeyCode -eq 'Return') { $_.Handled = $true; $st.done = $true; $f.Close() } elseif ($_.KeyValue -eq 65) { $all = @($checks | Where-Object { -not $_.Checked }).Count -gt 0; foreach ($c in $checks) { $c.Checked = $all } } })",
  '  $f.Add_Shown({ [void][FastPaste.U]::ShowWindow($f.Handle, 5); [void][FastPaste.U]::SetForegroundWindow($f.Handle); $f.Activate() })',
  '  [void]$f.ShowDialog()',
  '  $sel = @(); if ($st.done) { for ($i = 0; $i -lt $paths.Count; $i++) { if ($checks[$i].Checked) { $sel += $paths[$i] } } }',
  "  foreach ($c in $flow.Controls) { foreach ($x in $c.Controls) { if ($x -is [System.Windows.Forms.PictureBox] -and $x.Image) { $x.Image.Dispose() } } }; $f.Dispose()",
  "  Say ('PICK ' + ($sel -join '|'))",
  '}',
  "$req = Join-Path $dir 'view.req'",
  // 골라 붙이기 쪽지: 한 줄에 그림 하나(복사한 순서). 모드가 쓰고, 감시가 읽으면 지운다
  "$preq = Join-Path $dir 'pick.req'",
  "Remove-Item -LiteralPath $preq -Force",
  "Remove-Item -LiteralPath $req -Force",
  // 보낼 때까지 지우면 안 되는 그림 목록(한 줄에 경로 하나). 모드가 붙일 때마다 쓰고, 보내면 비운다
  "$keep = Join-Path $dir 'keep.txt'",
  "Say 'READY'",
  // 창 미리 데우기: 이 PC는 창 종류를 처음 만들 때 몇 초 걸려(모아 보기 첫 표시 4~8초, 2026-10-20 실측) 보이지 않게 한 번 만들어 둔다.
  // READY 뒤에 하므로 붙이기 준비는 늦어지지 않는다. 화면에는 아무것도 안 뜬다(Handle 만 만들고 Show 하지 않음)
  '$w = New-Object System.Windows.Forms.Form; $w.Controls.Add((New-Object System.Windows.Forms.FlowLayoutPanel)); $w.Controls.Add((New-Object System.Windows.Forms.PictureBox)); $w.Controls.Add((New-Object System.Windows.Forms.Label)); $null = $w.Handle; $w.Dispose()',
  'while ($true) {',
  // 쪽지 한 줄 = 그림 하나. 한 장이면 크게, 여러 장이면 모아 보기
  "  if (Test-Path -LiteralPath $req) { $vp = @((Get-Content -LiteralPath $req) | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }); Remove-Item -LiteralPath $req -Force; if ($vp.Count -gt 1) { Show-Gallery $vp } elseif ($vp.Count -eq 1) { Show-Image $vp 0 } }",
  "  if (Test-Path -LiteralPath $preq) { $pp = @((Get-Content -LiteralPath $preq) | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }); Remove-Item -LiteralPath $preq -Force; Show-Picker $pp }",
  '  $s = [FastPaste.U]::GetClipboardSequenceNumber()',
  '  if ($s -ne $last) {',
  '    $last = $s',
  '    $img = $null',
  '    try { if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $img = [System.Windows.Forms.Clipboard]::GetImage() } } catch {}',
  '    if ($img) {',
  "      $n++; $p = Join-Path $dir ([string]$n + '.png')",
  '      $img.Save($p, [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose()',
  // 입력칸에 붙여 둔 그림(keep.txt 에 적힌 것)은 보낼 때까지 지우지 않는다. 그것 말고 최근 KEEP_COPIED 장만 남긴다.
  // 2026-10-21: 36장 붙인 메시지에서 앞 26장이 보내기 전에 지워져 10장만 첨부됐다(대화 기록 실측)
  "      $kp = @(); if (Test-Path -LiteralPath $keep) { $kp = @(Get-Content -LiteralPath $keep) }",
  "      Get-ChildItem $dir -Filter '*.png' | Where-Object { $kp -notcontains $_.FullName } | Sort-Object LastWriteTime -Descending | Select-Object -Skip " + KEEP_COPIED + ' | Remove-Item -Force',
  "      Say ('IMG ' + $p)",
  "    } else { Say 'NOIMG' }",
  '  }',
  "  if (((Get-Date) - $beat).TotalSeconds -ge 10) { $beat = Get-Date; Say 'PING' }",
  '  Start-Sleep -Milliseconds 250',
  '}',
].join('\n')

// PowerShell -EncodedCommand 용: 스크립트를 UTF-16LE 바이트로 바꿔 base64 로 만든다(따옴표·줄바꿈 이스케이프 문제를 통째로 피함)
export function encodePs(script: string): string {
  let bin = ''
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bin += String.fromCharCode(c & 0xff, c >> 8)
  }
  return btoa(bin)
}

// 감시 스크립트가 찍는 한 줄의 뜻
export type WatchLine =
  | { kind: 'ready' }
  | { kind: 'image'; path: string }
  | { kind: 'noimage' }
  | { kind: 'pick'; paths: string[] }
  | { kind: 'other' }

// 출력 한 줄을 해석한다: READY / IMG <경로> / NOIMG / PICK <경로|경로|...>(골라 붙이기 결과, 취소면 빈 목록) / 그 밖(PING 등)
export function parseLine(line: string): WatchLine {
  const t = line.trim()
  if (t === 'READY') return { kind: 'ready' }
  if (t === 'NOIMG') return { kind: 'noimage' }
  if (t === 'PICK' || t.startsWith('PICK ')) return { kind: 'pick', paths: t.slice(4).split('|').map(s => s.trim()).filter(Boolean) }
  if (t.startsWith('IMG ')) return { kind: 'image', path: t.slice(4).trim() }
  return { kind: 'other' }
}

// 출력은 줄 단위가 아니라 조각으로 오므로, 남은 조각(rest)에 이어 붙여 완성된 줄만 꺼낸다
export function splitLines(rest: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (rest + chunk).split(/\r?\n/)
  return { lines: parts.slice(0, -1), rest: parts[parts.length - 1] ?? '' }
}

// [보기] 쪽지 파일 경로: 그림과 같은 폴더의 view.req (감시 스크립트의 $req 와 같은 이름)
export function viewRequestPath(imagePath: string): string {
  const cut = Math.max(imagePath.lastIndexOf('\\'), imagePath.lastIndexOf('/'))
  return `${imagePath.slice(0, cut + 1)}view.req`
}

// "지우지 말 그림" 목록 파일 경로: 그림과 같은 폴더의 keep.txt (감시 스크립트의 $keep 와 같은 이름)
export function keepListPath(imagePath: string): string {
  return viewRequestPath(imagePath).replace(/view\.req$/, 'keep.txt')
}

// 골라 붙이기 쪽지 경로: 그림과 같은 폴더의 pick.req (감시 스크립트의 $preq 와 같은 이름)
export function pickRequestPath(imagePath: string): string {
  return viewRequestPath(imagePath).replace(/view\.req$/, 'pick.req')
}

// 여러 장을 한 번에 넣을 글: "@<경로> " 를 이어 붙인다.
// 0.3.0: 별명("@imageN")과 prompt.mention 치환을 버리고 경로를 그대로 넣는다 — Claude Code 의 평범한 파일 언급이라
// 별도 훅 없이 첨부되고, 플러그인 디렉터리가 prompt.mention 을 아직 모르는 이벤트로 막아서(2026-10-23 포털 Validate)
export function pathsText(paths: string[]): string {
  return paths.map(p => `@${p} `).join('')
}

// 입력칸 글에서 이 모드가 넣은 그림 언급을 찾는다: "@…\.cfp\<번호>\<번호>.png" 꼴(감시 스크립트가 저장하는 경로 모양).
// 다른 "@파일" 언급은 건드리지 않는다. 같은 경로는 한 번만
export function findImageMentions(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/@(\S*[\\/]\.cfp[\\/]\d+[\\/]\d+\.png)/g)) {
    const p = m[1] ?? ''
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

// 보낼 글 속 그림 언급 중 파일이 없어진 것들(감시가 지웠거나 세션이 바뀐 경우)
export function missingImages(text: string, exists: (path: string) => boolean): string[] {
  return findImageMentions(text).filter(p => !exists(p))
}

// 단축키 설정(plugin.json userConfig). 모드는 키를 직접 묶을 수 없어 엔진의 안 쓰는 동작 4개를 빌리고,
// 사용자가 고른 키를 ~/.claude/keybindings.json 에서 그 동작에 묶는다(fast-paste-setup 스킬이 써 준다).
// 여기서는 띠 버튼에 보여 줄 키 이름과, 스킬이 쓸 keybindings 조각을 만든다
export const KEY_DEFAULTS = { pasteKey: 'alt+v', viewKey: 'alt+i', pasteAllKey: 'alt+a', pickKey: 'alt+g' } as const
export type KeyField = keyof typeof KEY_DEFAULTS
// 빌리는 엔진 동작: 평소 채팅 화면에서 안 쓰는 것들(변경 비교 창·REPL 탭용)
export const KEY_ACTIONS: Record<KeyField, string> = {
  pasteKey: 'app:toggleReplTab',
  viewKey: 'app:toggleDiffPreSession',
  pasteAllKey: 'app:cycleDiffBase',
  pickKey: 'app:diffFileListDown',
}

// 설정값에서 키 하나를 꺼낸다: 비었거나 문자열이 아니면 기본값, 공백 제거·소문자
export function keyOf(options: Readonly<Record<string, unknown>>, field: KeyField): string {
  const v = options[field]
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s || KEY_DEFAULTS[field]
}

// 띠 버튼에 보일 모양: "alt+v" → "Alt+V", "ctrl+shift+p" → "Ctrl+Shift+P"
export function keyLabel(key: string): string {
  return key.split('+').map(p => (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join('+')
}

// ~/.claude/keybindings.json 에 넣을 조각. 붙이기 키가 Claude 기본 그림 붙여넣기(alt+v)와 겹치면
// 채팅 문맥에서 그 키를 비우고 기본 붙여넣기는 alt+shift+v 로 옮긴다
export function keybindingsFor(keys: Record<KeyField, string>): { bindings: { context: string; bindings: Record<string, string | null> }[] } {
  const global: Record<string, string> = {}
  for (const f of Object.keys(KEY_ACTIONS) as KeyField[]) global[keys[f]] = KEY_ACTIONS[f]
  const out: { context: string; bindings: Record<string, string | null> }[] = []
  if (Object.values(keys).includes('alt+v')) out.push({ context: 'Chat', bindings: { 'alt+v': null, 'alt+shift+v': 'chat:imagePaste' } })
  out.push({ context: 'Global', bindings: global })
  return { bindings: out }
}

