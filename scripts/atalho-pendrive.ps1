# atalho-pendrive.ps1 — contraparte Windows do atalho-pendrive.sh. Cria um atalho
# que abre o Finan SEMPRE DO PENDRIVE (a fonte da verdade). O atalho aponta para
# um lançador que, no clique, procura o Finan.exe em qualquer unidade removível —
# a letra do pendrive muda de máquina pra máquina, então não é cravada.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atalho-pendrive.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\atalho-pendrive.ps1 -Remover
param([switch]$Remover)

$ErrorActionPreference = 'Stop'
$dest      = Join-Path $env:LOCALAPPDATA 'Finan'
$launcher  = Join-Path $dest 'abrir-finan-pendrive.ps1'
$desktop   = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$lnkDesk   = Join-Path $desktop   'Finan (pendrive).lnk'
$lnkStart  = Join-Path $startMenu 'Finan (pendrive).lnk'

if ($Remover) {
  Remove-Item -Force -ErrorAction SilentlyContinue $lnkDesk, $lnkStart, $launcher
  Write-Host 'Atalho do pendrive removido.'
  return
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

# O lançador: varre as unidades por \Finan\Finan.exe e abre a primeira que achar;
# se nenhuma tiver, avisa (não cai na copia local, pra nao divergir os dados).
$corpo = @'
$ErrorActionPreference = 'SilentlyContinue'
# SÓ unidades removíveis e prontas: o C: tem a cópia local, e abrir ela faria os
# históricos divergirem — é justamente o que este atalho existe pra impedir.
# (Paridade com o .sh, que só olha /run/media e /media.)
foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
  if ($d.DriveType -ne [System.IO.DriveType]::Removable -or -not $d.IsReady) { continue }
  $raiz = $d.RootDirectory.FullName
  foreach ($rel in @('Finan\Finan.exe', 'Finan.exe')) {
    $exe = Join-Path $raiz $rel
    if (Test-Path $exe) { Start-Process $exe; return }
  }
}
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show('Pendrive do Finan nao encontrado. Plugue o pendrive e tente de novo.', 'Finan') | Out-Null
'@
# UTF-8 com BOM: o Windows PowerShell 5.1 le como ANSI sem o BOM e quebra acento.
$utf8bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($launcher, $corpo, $utf8bom)

# .lnk (Area de trabalho + Menu Iniciar) apontando pro lancador em janela oculta.
$ws = New-Object -ComObject WScript.Shell
foreach ($lnk in @($lnkDesk, $lnkStart)) {
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath       = (Get-Command powershell.exe).Source
  $s.Arguments        = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
  $s.WorkingDirectory = $dest
  $s.Description       = 'Abre o Finan a partir do pendrive'
  $s.Save()
}

Write-Host "Atalho 'Finan (pendrive)' criado (Area de trabalho + Menu Iniciar)."
Write-Host "  lancador: $launcher"
Write-Host "  ao clicar: procura o Finan.exe no pendrive; se nao estiver plugado, avisa."
