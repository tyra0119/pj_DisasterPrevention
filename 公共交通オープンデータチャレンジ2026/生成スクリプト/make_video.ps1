# ノートのナレーションを音声にしてスライドに埋め、PowerPoint に動画を書き出させる。
$ErrorActionPreference = 'Stop'
$root = "C:\Users\takas\OneDrive\ドキュメント\GitHub\DisasterPrevention\公共交通オープンデータチャレンジ2026"
$src  = "$root\紹介スライド.pptx"
$narr = "$root\紹介スライド_ナレーション付き.pptx"
$mp4  = "$root\紹介動画.mp4"
$wav  = "$env:TEMP\deck-narration"
New-Item -ItemType Directory -Force $wav | Out-Null

Add-Type -AssemblyName System.Speech
$tts = New-Object System.Speech.Synthesis.SpeechSynthesizer
$tts.SelectVoice('Microsoft Haruka Desktop')
$tts.Rate = 3

$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($src, $false, $false, $false)

$i = 0
foreach ($slide in $pres.Slides) {
  $i++
  $text = ''
  foreach ($shape in $slide.NotesPage.Shapes) {
    if ($shape.PlaceholderFormat.Type -eq 2) { $text = $shape.TextFrame.TextRange.Text }  # ppPlaceholderBody
  }
  $file = "$wav\s$('{0:D2}' -f $i).wav"
  $tts.SetOutputToWaveFile($file)
  $tts.Speak($text)
  $tts.SetOutputToNull()

  # 長さ (秒)
  $bytes = (Get-Item $file).Length
  $sec = [math]::Round(($bytes - 44) / (22050 * 2), 1)   # 22.05kHz 16bit mono
  if ($sec -lt 3) { $sec = 3 }

  # 音声を埋める。画面外に置き、自動再生
  $media = $slide.Shapes.AddMediaObject2($file, 0, -1, 10, 10, 20, 20)   # LinkToFile=0(false), SaveWithDocument=-1(true)
  $media.Left = -100; $media.Top = -100
  $media.AnimationSettings.PlaySettings.PlayOnEntry = -1
  $media.AnimationSettings.PlaySettings.HideWhileNotPlaying = -1

  $slide.SlideShowTransition.AdvanceOnClick = 0
  $slide.SlideShowTransition.AdvanceOnTime = -1
  $slide.SlideShowTransition.AdvanceTime = $sec + 0.5
  $slide.SlideShowTransition.EntryEffect = 1281   # ppEffectFade
  $slide.SlideShowTransition.Duration = 0.5
  Write-Output ("slide {0}: {1}s" -f $i, $sec)
}

$pres.SaveAs($narr)

# 動画。UseTimingsAndNarrations=true, DefaultSlideDuration=5, VertResolution=1080, FPS=30, Quality=85
$pres.CreateVideo($mp4, $true, 5, 1080, 30, 85)
while ($pres.CreateVideoStatus -eq 1 -or $pres.CreateVideoStatus -eq 2) { Start-Sleep -Seconds 3 }   # 1=queued 2=in progress
Write-Output ("video status {0}" -f $pres.CreateVideoStatus)   # 3=done 4=failed
$pres.Close()
$app.Quit()
Get-Item $mp4 | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}
