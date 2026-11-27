$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = Join-Path $repoPath 'mobile/assets/images/icon.png'
$buildPath = Join-Path $repoPath 'build'
$assetPath = Join-Path $repoPath 'desktop/assets'
[IO.Directory]::CreateDirectory($assetPath) | Out-Null
[IO.File]::Copy($sourcePath, (Join-Path $buildPath 'icon.png'), $true)
[IO.File]::Copy($sourcePath, (Join-Path $assetPath 'icon.png'), $true)
$sourceImage = [Drawing.Image]::FromFile($sourcePath)
$frames = @()
try {
  foreach ($size in @(16,20,24,32,40,48,64,128,256)) {
    $bitmap = [Drawing.Bitmap]::new($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $memory = [IO.MemoryStream]::new()
    try {
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
      $frames += [pscustomobject]@{Size=$size;Data=$memory.ToArray()}
    } finally { $graphics.Dispose(); $bitmap.Dispose(); $memory.Dispose() }
  }
  $stream = [IO.File]::Create((Join-Path $buildPath 'icon.ico'))
  $writer = [IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
      $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
      $writer.Write([Byte]$dimension); $writer.Write([Byte]$dimension); $writer.Write([Byte]0); $writer.Write([Byte]0)
      $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$frame.Data.Length); $writer.Write([UInt32]$offset)
      $offset += $frame.Data.Length
    }
    foreach ($frame in $frames) { $writer.Write([Byte[]]$frame.Data) }
  } finally { $writer.Dispose(); $stream.Dispose() }
} finally { $sourceImage.Dispose() }
Write-Output 'Current Lull logo copied; nine Windows icon sizes generated.'
