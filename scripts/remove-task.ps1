param(
  [string]$TaskName = 'PalworldAutoManager'
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

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tarefa $TaskName removida."
} else {
  Write-Host "Tarefa $TaskName nao encontrada."
}
