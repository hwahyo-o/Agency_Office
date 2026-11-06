$ErrorActionPreference = 'Stop'
$version = '22.21.1'
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ($env:PROCESSOR_ARCHITECTURE -eq 'x86') { 'x86' } else { 'x64' }
$archiveName = "node-v$version-win-$architecture.zip"
$base = "https://nodejs.org/dist/v$version"
$target = Join-Path $env:LOCALAPPDATA 'AI-Team-Office\runtime'
$temp = Join-Path $env:TEMP ("ai-team-office-node-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
    $archive = Join-Path $temp $archiveName
    $checksums = Join-Path $temp 'SHASUMS256.txt'
    Invoke-WebRequest -Uri "$base/$archiveName" -OutFile $archive
    Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -OutFile $checksums
    $line = Select-String -Path $checksums -Pattern ("\s" + [regex]::Escape($archiveName) + '$') | Select-Object -First 1
    if (-not $line) { throw 'Official checksum entry was not found.' }
    $expected = ($line.Line.Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'Node.js archive checksum did not match.' }
    $unpack = Join-Path $temp 'unpacked'
    Expand-Archive -Path $archive -DestinationPath $unpack
    $extracted = Join-Path $unpack "node-v$version-win-$architecture"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Path (Join-Path $extracted '*') -Destination $target -Recurse -Force
    if (-not (Test-Path (Join-Path $target 'node.exe'))) { throw 'node.exe was not found after extraction.' }
    Write-Host "Portable Node.js $version is ready in the app data folder."
} finally {
    Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue
}
