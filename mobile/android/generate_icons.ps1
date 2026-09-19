Add-Type -AssemblyName System.Drawing
$sizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}
$baseDir = "D:\Tech and Development\Coding\remotva\mobile\android\app\src\main\res"

foreach ($pair in $sizes.GetEnumerator()) {
    $dir = Join-Path $baseDir $pair.Key
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $sz = $pair.Value
    
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 9, 9, 11))
    $g.FillRectangle($bgBrush, 0, 0, $sz, $sz)
    
    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 6, 182, 212))
    $padding = [int]($sz * 0.2)
    $innerSize = $sz - (2 * $padding)
    $g.FillEllipse($accentBrush, $padding, $padding, $innerSize, $innerSize)
    
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $innerPadding = [int]($sz * 0.35)
    $whiteSize = $sz - (2 * $innerPadding)
    $g.FillEllipse($whiteBrush, $innerPadding, $innerPadding, $whiteSize, $whiteSize)
    
    $bmp.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save((Join-Path $dir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    
    $g.Dispose()
    $bmp.Dispose()
}
Write-Output "Icons generated successfully"
