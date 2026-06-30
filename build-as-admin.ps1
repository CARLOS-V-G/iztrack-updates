$ErrorActionPreference = "Stop"
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
Remove-Item -Recurse -Force $cacheDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null

$tmpExtract = "$env:TEMP\winCodeSign_extract"
Remove-Item -Recurse -Force $tmpExtract -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmpExtract -Force | Out-Null

$archiveUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
$archivePath = "$tmpExtract\winCodeSign.7z"
Write-Host "Downloading winCodeSign..."
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
(New-Object System.Net.WebClient).DownloadFile($archiveUrl, $archivePath)

# Use cmd's mklink to create real symlinks (works because we're admin)
$libDir = "$tmpExtract\darwin\10.12\lib"
New-Item -ItemType Directory -Path $libDir -Force | Out-Null

# Extract non-symlink files first using 7za without -snl
Write-Host "Extracting with 7za..."
$7za = "D:\Proyect_Code\iztrack-updates\node_modules\7zip-bin\win\x64\7za.exe"
& $7za x -y "-o$tmpExtract" "$archivePath" 2>&1 | Select-String -NotMatch "Cannot create symbolic link|ERROR|Sub items Errors|Archives with Errors"

# Check if the dylib files exist (if symlinks failed, create them)
if (!(Test-Path "$libDir\libcrypto.dylib")) {
    Write-Host "Creating libcrypto.dylib file..."
    Set-Content -Path "$libDir\libcrypto.dylib" -Value $null -NoNewline
}
if (!(Test-Path "$libDir\libssl.dylib")) {
    Write-Host "Creating libssl.dylib file..."
    Set-Content -Path "$libDir\libssl.dylib" -Value $null -NoNewline
}

# Copy everything to cache dir
Write-Host "Copying to cache..."
Get-ChildItem -Path $tmpExtract | ForEach-Object {
    $dest = Join-Path $cacheDir $_.Name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    if ($_.PSIsContainer) { Copy-Item -Recurse -LiteralPath $_.FullName -Destination $cacheDir }
    else { Copy-Item -LiteralPath $_.FullName -Destination $cacheDir }
}

# Clean up temp
Remove-Item -Recurse -Force $tmpExtract -ErrorAction SilentlyContinue

Write-Host "Cache ready. Building installer..."
Set-Location D:\Proyect_Code\iztrack-updates
$env:WIN_CSC_LINK = $null
$env:WIN_CSC_KEY_PASSWORD = $null
$env:CSC_LINK = $null
$env:CSC_KEY_PASSWORD = $null
npx electron-builder --win nsis --publish never -c electron-builder-no-sign.json 2>&1

Write-Host "Done!"
Read-Host "Press Enter to exit"
