param(
  [ValidateSet('Startup', 'Logon')]
  [string]$Trigger = 'Startup',
  [string]$TaskName = 'PalworldServerAutoSleep'
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute este script como administrador.'
  }
}

Assert-Admin

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$distIndex = Join-Path $projectRoot 'dist\index.js'

if (-not (Test-Path $distIndex)) {
  throw 'dist/index.js nao encontrado. Execute npm run build antes de instalar a tarefa.'
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$distIndex`"" -WorkingDirectory $projectRoot
$triggerObject = if ($Trigger -eq 'Startup') {
  New-ScheduledTaskTrigger -AtStartup
} else {
  New-ScheduledTaskTrigger -AtLogOn
}

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Trigger $triggerObject -Principal $principal -Settings $settings

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Tarefa $TaskName instalada com sucesso."
