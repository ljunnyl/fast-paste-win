# 플러그인 아이콘(512x512 PNG) 생성 스크립트 — 디렉터리 제출용. 한 번만 실행한다(처음 제출 때 아이콘이 고정된다).
# 모양: 둥근 남색 바탕 위에 흰 클립보드, 그 안에 산 모양 그림 아이콘, 오른쪽 아래 번개(빠름 표시).
Add-Type -AssemblyName System.Drawing
$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# 둥근 사각형 경로 만들기
function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r, $r, 180, 90)
  $p.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
  $p.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
  $p.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
  $p.CloseFigure()
  return $p
}

# 바탕: 남색 둥근 사각형
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
$g.FillPath($bg, (RoundRect 0 0 $size $size 110))

# 클립보드 판(흰색)과 집게(연회색)
$white = [System.Drawing.Brushes]::White
$g.FillPath($white, (RoundRect 116 96 280 340 40))
$clip = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
$g.FillPath($clip, (RoundRect 196 64 120 64 24))

# 클립보드 안 그림: 하늘(연파랑) + 해 + 산 두 개
$sky = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 186, 230, 253))
$g.FillPath($sky, (RoundRect 152 160 208 220 24))
$sun = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 191, 36))
$g.FillEllipse($sun, 288, 184, 40, 40)
$m1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
$g.FillPolygon($m1, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 152, 380), (New-Object System.Drawing.Point 236, 262), (New-Object System.Drawing.Point 320, 380)))
$m2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 163, 74))
$g.FillPolygon($m2, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 250, 380), (New-Object System.Drawing.Point 312, 300), (New-Object System.Drawing.Point 360, 380)))

# 번개(노랑, 검은 테두리 없음) — 오른쪽 아래
$bolt = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 250, 204, 21))
$pts = [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point 392, 300), (New-Object System.Drawing.Point 332, 400),
  (New-Object System.Drawing.Point 384, 400), (New-Object System.Drawing.Point 356, 480),
  (New-Object System.Drawing.Point 440, 370), (New-Object System.Drawing.Point 388, 370),
  (New-Object System.Drawing.Point 420, 300))
$outline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 41, 59)), 10
$outline.LineJoin = 'Round'
$g.DrawPolygon($outline, $pts)
$g.FillPolygon($bolt, $pts)

$out = Join-Path $PSScriptRoot '..\.claude-plugin\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "saved $out"
