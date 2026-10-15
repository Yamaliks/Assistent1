param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$BundleChecker
)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path $Installer).Path
$checker = (Resolve-Path $BundleChecker).Path
$installDir = Join-Path ([IO.Path]::GetTempPath()) ('Assistent1 SOL ' + [Guid]::NewGuid().ToString('N'))
$dataDir = Join-Path $env:LOCALAPPDATA 'com.assistent1.desktop'
[IO.Directory]::CreateDirectory($dataDir) | Out-Null
$marker = Join-Path $dataDir ('installer-preservation-' + [Guid]::NewGuid().ToString('N') + '.txt')
Set-Content -Path $marker -Value 'existing user data must survive reinstall'
try {
  for ($round = 0; $round -lt 2; $round++) {
    # NSIS /D is last and intentionally unquoted; it consumes the remainder as a directory.
    $process = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installDir") -PassThru
    if (!$process.WaitForExit(300000)) { throw 'Silent install/reinstall exceeded 5 minutes' }
    if ($process.ExitCode -notin @(0, 3010)) { throw "NSIS installation failed: $($process.ExitCode)" }
    if (!(Test-Path (Join-Path $installDir 'assistent1.exe'))) { throw 'Installed application EXE is missing' }
    if (!(Test-Path $marker)) { throw 'Installer removed existing application data' }
    $bundle = Join-Path $installDir 'sol'
    # Checks every unpacked DLL/model/license size and SHA, then actually loads Vosk + Russian model.
    # No network download is performed by this checker. Silence is not a microphone recognition test.
    & $checker $bundle
    if ($LASTEXITCODE -ne 0) { throw "Installed Vosk/model validation failed: $LASTEXITCODE" }
  }
  # Exercise the installed EXE too: hide to tray, reopen the same HWND/second-instance.
  & (Join-Path $PSScriptRoot 'windows-reopen.ps1') -Exe (Join-Path $installDir 'assistent1.exe')
  $result = "NSIS install and reinstall passed: unpacked SOL inventory, native DLL/model loading, Russian TTS non-silent PCM, installed close/reopen/second-instance, existing data marker preserved. Installer: $installerPath"
  Write-Output $result
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $result }
} finally {
  # Delete only our marker. Do not delete user settings or stop unrelated processes.
  if (Test-Path $marker) { Remove-Item -LiteralPath $marker }
}
