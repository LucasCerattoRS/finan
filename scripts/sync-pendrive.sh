#!/usr/bin/env bash
# Copia o Finan para o pendrive: o app portátil + o código-fonte.
#
#   ./scripts/sync-pendrive.sh                 # usa o pendrive padrão (P.Lucas)
#   ./scripts/sync-pendrive.sh /caminho/pen    # ou aponta um destino
#
# Regras:
#  - NUNCA sobrescreve o dados.json que já estiver no pendrive (é o seu histórico).
#  - Não copia node_modules nem dist (o código vai via `git archive`: só o que está
#    versionado, então dado financeiro real nunca vaza junto).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PEN="${1:-/run/media/$USER/P.Lucas}"
DESTINO="$PEN/Finan"

[[ -d "$PEN" ]] || { echo "Pendrive não encontrado em: $PEN" >&2; echo "Monte o pendrive ou passe o caminho como argumento." >&2; exit 1; }

APPIMAGE="$(ls -t "$RAIZ"/dist/Finan-*.AppImage 2>/dev/null | head -1 || true)"
[[ -n "$APPIMAGE" ]] || { echo "Nenhum AppImage em dist/. Rode antes:  npm run dist:linux" >&2; exit 1; }

mkdir -p "$DESTINO/codigo"

# 1) o app portátil (o dados.json nasce ao lado dele, aqui no pendrive)
cp -f "$APPIMAGE" "$DESTINO/Finan.AppImage"
chmod +x "$DESTINO/Finan.AppImage" 2>/dev/null || true # exFAT ignora, o mount é que dá o +x

# 2) o .exe do Windows, se já tiver sido gerado
EXE="$(ls -t "$RAIZ"/dist/Finan*.exe 2>/dev/null | head -1 || true)"
[[ -n "$EXE" ]] && cp -f "$EXE" "$DESTINO/Finan.exe"

# 3) o código-fonte: só arquivos versionados (git archive não enxerga o .gitignore-ado)
rm -rf "$DESTINO/codigo"
mkdir -p "$DESTINO/codigo"
git -C "$RAIZ" archive --format=tar HEAD | tar -x -C "$DESTINO/codigo"

cat > "$DESTINO/COMO-USAR.txt" <<'EOF'
Finan — finanças pessoais, offline e portátil
=============================================

LINUX
  Dê dois cliques em "Finan.AppImage".
  (Se não abrir: clique com o direito > Propriedades > marque "executável".)

WINDOWS
  Dê dois cliques em "Finan.exe".
  Na primeira vez o Windows mostra "O Windows protegeu o seu computador" (o app não
  tem assinatura digital paga): clique em "Mais informações" > "Executar assim mesmo".
  (Se o arquivo não estiver aqui, o .exe ainda não foi gerado.)

SEUS DADOS
  Ficam no "dados.json", nesta mesma pasta. O histórico anda com o pendrive.
  Faça backup de vez em quando: Config > Exportar backup.

O CÓDIGO
  Está em "codigo/". Para mexer/recompilar numa máquina com Node instalado:
      cd codigo
      npm install
      npm start            # abre o app
      npm run dist:linux   # gera o AppImage
      npm run dist:win     # gera o .exe (precisa de Windows ou wine)
EOF

echo "Sincronizado em: $DESTINO"
ls -lh "$DESTINO" | tail -n +2 | sed 's/^/  /'
[[ -e "$DESTINO/dados.json" ]] && echo "  (dados.json existente foi preservado)"
