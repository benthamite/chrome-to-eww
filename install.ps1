param(
    [Parameter(Mandatory=$true)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$HostName = "com.emacs.eww"
$InstallDir = "$env:LOCALAPPDATA\open-in-eww"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Copy host files.
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item "$ScriptDir\open-in-eww-host" -Destination $InstallDir -Force
Copy-Item "$ScriptDir\open-in-eww-host.bat" -Destination $InstallDir -Force
Write-Host "Installed scripts: $InstallDir"

# Write native messaging host manifest.
$Manifest = @{
    name = $HostName
    description = "Open URLs in Emacs eww browser"
    path = "$InstallDir\open-in-eww-host.bat"
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$Manifest | ConvertTo-Json | Set-Content "$InstallDir\$HostName.json" -Encoding UTF8

# Register with Chrome and Chromium via the registry.
$Installed = 0
foreach ($RegBase in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
)) {
    New-Item -Path $RegBase -Force | Out-Null
    Set-ItemProperty -Path $RegBase -Name "(Default)" -Value "$InstallDir\$HostName.json"
    Write-Host "Installed registry key: $RegBase"
    $Installed++
}

Write-Host ""
Write-Host "Restart your browser for changes to take effect."
