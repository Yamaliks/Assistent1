param([Parameter(Mandatory = $true)][string]$Exe)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativeWindow {
  public delegate bool EnumWindowsCallback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] public static extern int GetWindowTextW(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  public static IntPtr FindVisibleWindow(uint pid, string title) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((h, p) => {
      uint owner;
      GetWindowThreadProcessId(h, out owner);
      if (owner == pid && IsWindowVisible(h)) {
        var text = new StringBuilder(512);
        GetWindowTextW(h, text, text.Capacity);
        if (text.ToString() == title) { result = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
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
  $config = Get-Content (Join-Path $PSScriptRoot '../src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
  $title = ($config.app.windows | Where-Object { $_.label -eq 'main' }).title
  if (!$title) { throw 'Main window title is missing from Tauri configuration' }
  $start = [System.Diagnostics.ProcessStartInfo]::new((Resolve-Path $Exe).Path)
  $start.UseShellExecute = $false
  $start.RedirectStandardError = $true
  $primary = [System.Diagnostics.Process]::Start($start)
  $stderr = $primary.StandardError.ReadToEndAsync()
  # Process.MainWindowHandle can select single-instance's com.assistent1.desktop-siw.
  # Find the actual visible top-level main window by its PID and configured title.
  Wait-For { !$primary.HasExited -and [NativeWindow]::FindVisibleWindow($primary.Id, $title) -ne [IntPtr]::Zero } 'First launch did not show the configured main window'
  $handle = [NativeWindow]::FindVisibleWindow($primary.Id, $title)
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
