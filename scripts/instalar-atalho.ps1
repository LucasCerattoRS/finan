# instalar-atalho.ps1 — contraparte Windows do instalar-atalho.sh.
# Coloca o .exe portátil num lugar estável e cria os atalhos (Área de trabalho
# + Menu Iniciar).
#
#   npm run atalho:win
#   npm run atalho:win -- -Remover
#
# O .exe NÃO fica em dist\ porque `npm run dist:win` limpa essa pasta a cada
# build — e o dados.json vive AO LADO do executável. Ele é copiado para
# %LOCALAPPDATA%\Finan, que sobrevive aos rebuilds.
param([switch]$Remover)
$ErrorActionPreference = 'Stop'

$Raiz          = Split-Path -Parent $PSScriptRoot
$Destino       = Join-Path $env:LOCALAPPDATA 'Finan'
$AreaTrabalho  = [Environment]::GetFolderPath('Desktop')
$MenuIniciar   = [Environment]::GetFolderPath('Programs')
$LnkArea       = Join-Path $AreaTrabalho 'Finan.lnk'
$LnkMenu       = Join-Path $MenuIniciar  'Finan.lnk'

if ($Remover) {
  Remove-Item $LnkArea, $LnkMenu -Force -ErrorAction SilentlyContinue
  Write-Host "Atalho removido. Seus dados continuam em $Destino\dados.json"
  exit 0
}

$exe = Get-ChildItem (Join-Path $Raiz 'dist') -Filter 'Finan*.exe' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) {
  Write-Error 'Nenhum .exe em dist\. Rode antes:  npm run dist:win'
  exit 1
}

New-Item -ItemType Directory -Force $Destino | Out-Null
# Só o executável é sobrescrito; o dados.json ao lado dele nunca é tocado.
Copy-Item $exe.FullName (Join-Path $Destino 'Finan.exe') -Force

# O ícone já está embutido no .exe pelo electron-builder (build\icon.png).
$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in @($LnkArea, $LnkMenu)) {
  $atalho = $sh.CreateShortcut($lnk)
  $atalho.TargetPath       = Join-Path $Destino 'Finan.exe'
  $atalho.WorkingDirectory = $Destino
  $atalho.IconLocation     = (Join-Path $Destino 'Finan.exe') + ',0'
  $atalho.Description      = 'Gestor de finanças pessoais offline (entradas, saídas, cartões e parcelas)'
  $atalho.Save()
}

Write-Host 'Finan instalado.'
Write-Host "  app:    $Destino\Finan.exe"
Write-Host "  dados:  $Destino\dados.json  (fica ao lado do app; começa vazio)"
Write-Host "  atalho: Menu Iniciar + $AreaTrabalho"
