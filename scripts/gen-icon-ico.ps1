# Genera assets/icon.ico (multi-tamaño) desde favicon-512.png para MenuDigital.exe
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "assets\favicon-512.png"
$dst = Join-Path $root "assets\icon.ico"
if (-not (Test-Path $src)) { throw "Missing $src" }

$sizes = @(16, 32, 48, 64, 128, 256)
$img = [System.Drawing.Image]::FromFile($src)
$pngChunks = New-Object System.Collections.Generic.List[byte[]]

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $size, $size)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngChunks.Add($ms.ToArray())
  $ms.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}
$img.Dispose()

# ICO con entradas PNG (Vista+)
$count = $pngChunks.Count
$msOut = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $msOut
$bw.Write([uint16]0)      # reserved
$bw.Write([uint16]1)      # type = icon
$bw.Write([uint16]$count) # count

$offset = 6 + (16 * $count)
for ($i = 0; $i -lt $count; $i++) {
  $size = $sizes[$i]
  $data = $pngChunks[$i]
  $bw.Write([byte]($(if ($size -ge 256) { 0 } else { $size }))) # width
  $bw.Write([byte]($(if ($size -ge 256) { 0 } else { $size }))) # height
  $bw.Write([byte]0)  # color count
  $bw.Write([byte]0)  # reserved
  $bw.Write([uint16]1) # planes
  $bw.Write([uint16]32) # bit count
  $bw.Write([uint32]$data.Length)
  $bw.Write([uint32]$offset)
  $offset += $data.Length
}
for ($i = 0; $i -lt $count; $i++) {
  $bw.Write($pngChunks[$i])
}
$bw.Flush()
[System.IO.File]::WriteAllBytes($dst, $msOut.ToArray())
$bw.Dispose()
$msOut.Dispose()
Write-Output "wrote $dst ($count sizes)"
