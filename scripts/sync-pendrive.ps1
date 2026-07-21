# sync-pendrive.ps1 — contraparte Windows do sync-pendrive.sh.
# Copia o Finan para o pendrive: o app portátil + o código-fonte.
#
#   npm run pendrive:win                      # acha o pendrive pelo rótulo (P.Lucas)
#   npm run pendrive:win -- -Pendrive F:\     # ou aponta o destino
#
# Regras (as mesmas do script Linux):
#  - NUNCA sobrescreve o dados.json que já estiver no pendrive (é o seu histórico).
#  - Não copia node_modules nem dist (o código vai via `git archive`: só o que está
#    versionado, então dado financeiro real nunca vaza junto).
param([string]$Pendrive)
$ErrorActionPreference = 'Stop'

$Raiz = Split-Path -Parent $PSScriptRoot

if (-not $Pendrive) {
  # Sem destino explícito, só aceita o pendrive de rótulo conhecido — para não
  # despejar o app num drive removível qualquer que esteja plugado.
  $vol = Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.FileSystemLabel -eq 'P.Lucas' } | Select-Object -First 1
  if (-not $vol) {
    Write-Error 'Pendrive "P.Lucas" não encontrado. Plugue-o ou passe o destino:  npm run pendrive:win -- -Pendrive F:\'
    exit 1
  }
  $Pendrive = "$($vol.DriveLetter):\"
}
if (-not (Test-Path $Pendrive)) { Write-Error "Destino não encontrado: $Pendrive"; exit 1 }

$Destino = Join-Path $Pendrive 'Finan'
$Codigo  = Join-Path $Destino 'codigo'
New-Item -ItemType Directory -Force $Destino | Out-Null

# 1) o app portátil do Windows (o dados.json nasce ao lado dele, aqui no pendrive)
$exe = Get-ChildItem (Join-Path $Raiz 'dist') -Filter 'Finan*.exe' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) {
  Write-Error 'Nenhum .exe em dist\. Rode antes:  npm run dist:win'
  exit 1
}
Copy-Item $exe.FullName (Join-Path $Destino 'Finan.exe') -Force

# 2) o AppImage do Linux, se já tiver sido gerado nesta cópia do repo
$appimage = Get-ChildItem (Join-Path $Raiz 'dist') -Filter 'Finan-*.AppImage' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($appimage) { Copy-Item $appimage.FullName (Join-Path $Destino 'Finan.AppImage') -Force }

# 3) o código-fonte: só arquivos versionados (git archive não enxerga o ignorado)
$zip = Join-Path ([IO.Path]::GetTempPath()) 'finan-codigo.zip'
git -C $Raiz archive --format=zip -o $zip HEAD
if ($LASTEXITCODE -ne 0) { Write-Error 'git archive falhou'; exit 1 }
Remove-Item $Codigo -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $Codigo -Force
Remove-Item $zip -Force

@'
Finan — finanças pessoais, offline e portátil
=============================================

WINDOWS
  Dê dois cliques em "Finan.exe".
  Na primeira vez o Windows mostra "O Windows protegeu o seu computador" (o app não
  tem assinatura digital paga): clique em "Mais informações" > "Executar assim mesmo".

LINUX
  Dê dois cliques em "Finan.AppImage".
  (Se não abrir: clique com o direito > Propriedades > marque "executável".)
  (Se o arquivo não estiver aqui, o AppImage ainda não foi gerado.)

SEUS DADOS
  Ficam no "dados.json", nesta mesma pasta. O histórico anda com o pendrive.
  Faça backup de vez em quando: Config > Exportar backup.

O CÓDIGO
  Está em "codigo/". Para mexer/recompilar numa máquina com Node instalado:
      cd codigo
      npm install
      npm start            # abre o app
      npm run dist:win     # gera o .exe (no Windows)
      npm run dist:linux   # gera o AppImage (no Linux)
'@ | Set-Content (Join-Path $Destino 'COMO-USAR.txt') -Encoding UTF8

Write-Host "Sincronizado em: $Destino"
Get-ChildItem $Destino | ForEach-Object { "  {0}" -f $_.Name }
if (Test-Path (Join-Path $Destino 'dados.json')) { Write-Host '  (dados.json existente foi preservado)' }
