$ErrorActionPreference = "Stop"

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:USERPROFILE ".config\opencode\plugins\opencode-quota"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Copy-Item (Join-Path $src "index.ts")      $dest
Copy-Item (Join-Path $src "tui.tsx")       $dest
Copy-Item (Join-Path $src "tui.js")        $dest
Copy-Item (Join-Path $src "package.json")  $dest

Write-Host "Installed opencode-quota -> $dest"
Write-Host "Restart OpenCode or run: opencode service restart"
