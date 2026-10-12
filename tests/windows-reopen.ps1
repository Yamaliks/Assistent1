param([Parameter(Mandatory = $true)][string]$Exe)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeWindow {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
}
'@
function Wait-For([scriptblock]$Condition, [string]$Failure) {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  throw $Failure
}
if ([NativeWindow]::GetShellWindow() -eq [IntPtr]::Zero) {
  Write-Output '::warning::Native reopen smoke test skipped: runner has no interactive Windows shell. Run the manual tray checklist on Windows.'
  exit 0
}
$primary = $null
try {
  $start = [System.Diagnostics.ProcessStartInfo]::new((Resolve-Path $Exe).Path)
  $start.UseShellExecute = $false
  $start.RedirectStandardError = $true
  $primary = [System.Diagnostics.Process]::Start($start)
  $stderr = $primary.StandardError.ReadToEndAsync()
  Wait-For { $primary.Refresh(); !$primary.HasExited -and $primary.MainWindowHandle -ne [IntPtr]::Zero } 'First launch did not show the main window'
  $handle = $primary.MainWindowHandle
  if ($primary.MainWindowTitle -ne 'Assistent1') { throw "Unexpected startup window: $($primary.MainWindowTitle)" }
  if (![NativeWindow]::IsWindowVisible($handle)) { throw 'First launch window is hidden' }
  for ($round = 0; $round -lt 2; $round++) {
    if ($round -eq 1) { [void][NativeWindow]::ShowWindow($handle, 6) }
    [void][NativeWindow]::SendMessageW($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
    Wait-For { ![NativeWindow]::IsWindowVisible($handle) } 'Close did not hide the main window'
    if ($primary.HasExited) { throw "Close ended the process: $($stderr.GetAwaiter().GetResult())" }
    if (![NativeWindow]::IsWindow($handle)) { throw "Close destroyed main HWND (process alive). Round: $round" }
    $second = [System.Diagnostics.Process]::Start([System.Diagnostics.ProcessStartInfo]::new((Resolve-Path $Exe).Path))
    try {
      if (!$second.WaitForExit(30000)) { throw 'Second instance did not exit' }
      if ($null -eq $second.ExitCode) { throw 'Second instance exit status could not be read' }
      if ($second.ExitCode -ne 0) { throw "Second instance failed: $($second.ExitCode)" }
      Wait-For { [NativeWindow]::IsWindowVisible($handle) -and ![NativeWindow]::IsIconic($handle) } 'Second launch did not restore the same HWND'
    } finally {
      if (!$second.HasExited) { Stop-Process -Id $second.Id -Force }
    }
  }
  $result = 'Native release smoke passed: first launch visible, close preserves HWND, repeated EXE exits and restores the original minimized/hidden window.'
  Write-Output $result
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $result }
} catch {
  $detail = $_.Exception.Message -replace '[\r\n]+', ' '
  Write-Output "::error::Native reopen smoke failed: $detail"
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value "Native reopen smoke failed: $detail" }
  throw
} finally {
  if ($primary -and !$primary.HasExited) { Stop-Process -Id $primary.Id -Force }
}
