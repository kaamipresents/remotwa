$ErrorActionPreference = "Stop"
$destDir = "K:\Android\ndk"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$zipPath = "K:\ndk.zip"
$finalNdk = "K:\Android\ndk\26.1.10909125"

if (-not (Test-Path $finalNdk)) {
    Write-Host "Downloading NDK r26b to K:\ndk.zip..."
    curl.exe -L -o $zipPath https://dl.google.com/android/repository/android-ndk-r26b-windows.zip
    
    Write-Host "Extracting NDK to K:\Android\ndk..."
    tar.exe -xf $zipPath -C $destDir
    
    if (Test-Path "K:\Android\ndk\android-ndk-r26b") {
        Rename-Item -Path "K:\Android\ndk\android-ndk-r26b" -NewName "26.1.10909125"
    }
    
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

Write-Host "NDK installed at $finalNdk"

# Create junction in C: SDK ndk if not already there
$cSdkNdk = "C:\Users\sweet\AppData\Local\Android\Sdk\ndk"
if (-not (Test-Path $cSdkNdk)) {
    New-Item -ItemType Directory -Path $cSdkNdk -Force | Out-Null
}
$cJunction = Join-Path $cSdkNdk "26.1.10909125"
if (Test-Path $cJunction) {
    Remove-Item $cJunction -Recurse -Force -ErrorAction SilentlyContinue
}
cmd.exe /c mklink /J "$cJunction" "$finalNdk"
Write-Host "Junction created: $cJunction -> $finalNdk"
