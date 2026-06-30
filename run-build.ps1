$ErrorActionPreference = "Stop"
Set-Location D:\Proyect_Code\iztrack-updates

# Clean old cache
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
Remove-Item -Recurse -Force $cacheDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null

# Download archive
$archiveUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
$archivePath = "$env:TEMP\winCodeSign.7z"
Write-Host "Downloading winCodeSign..."
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
(New-Object System.Net.WebClient).DownloadFile($archiveUrl, $archivePath)

# Extract with system cmd's mklink - since we're SYSTEM/admin, this works
$extractDir = "$env:TEMP\winCodeSign_extracted"
Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

Write-Host "Extracting with 7za (as admin, symlinks should work)..."
$7za = "D:\Proyect_Code\iztrack-updates\node_modules\7zip-bin\win\x64\7za.exe"
& $7za x -y "-o$extractDir" $archivePath 2>&1 | % { $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Host "7za exited with code $LASTEXITCODE but continuing..."
}

# Create missing symlinks manually using cmd.exe mklink
$libDir = "$extractDir\darwin\10.12\lib"
if (!(Test-Path "$libDir\libcrypto.dylib")) {
    Write-Host "Creating libcrypto.dylib symlink..."
    pushd $libDir
    cmd /c "mklink libcrypto.dylib libcrypto.1.0.0.dylib 2>&1"
    popd
}
if (!(Test-Path "$libDir\libssl.dylib")) {
    Write-Host "Creating libssl.dylib symlink..."
    pushd $libDir
    cmd /c "mklink libssl.dylib libssl.1.0.0.dylib 2>&1"
    popd
}

# Copy to cache dir
Get-ChildItem -Path $extractDir | ForEach-Object {
    $dest = Join-Path $cacheDir $_.Name
    if ($_.PSIsContainer) { Copy-Item -Recurse -LiteralPath $_.FullName -Destination $cacheDir -Force }
    else { Copy-Item -LiteralPath $_.FullName -Destination $cacheDir -Force }
}

# Also copy the archive to cache so app-builder can find it
Copy-Item $archivePath "$cacheDir\winCodeSign-2.6.0.7z" -Force

Write-Host "Cache populated. Verifying..."
Get-ChildItem -Recurse $cacheDir | Select-Object Mode, Name | Format-Table -AutoSize

# Now run the build
Write-Host "`nBuilding installer..."
$env:WIN_CSC_LINK = $null
$env:WIN_CSC_KEY_PASSWORD = $null
$env:CSC_LINK = $null
$env:CSC_KEY_PASSWORD = $null
npx electron-builder --win nsis --publish never -c electron-builder-no-sign.json 2>&1

Write-Host "`nDone!"
Read-Host "Press Enter to exit"
