#!/usr/bin/env bash
# Instala um atalho que abre o Finan SEMPRE DO PENDRIVE (a fonte da verdade do
# PLANO). O atalho é "esperto": na hora do clique ele procura o Finan.AppImage em
# qualquer pendrive montado — não precisa cravar o rótulo. Se o pendrive não
# estiver plugado, avisa em vez de abrir a cópia local (que faria os dados divergir).
#
#   ./scripts/atalho-pendrive.sh            # instala/atualiza
#   ./scripts/atalho-pendrive.sh --remover  # desinstala
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DADOS="${XDG_DATA_HOME:-$HOME/.local/share}"
DESTINO="$DADOS/Finan"
APPS="$DADOS/applications"
ICONES="$DADOS/icons/hicolor/512x512/apps"
DESKTOP_FILE="$APPS/finan-pendrive.desktop"
LAUNCHER="$DESTINO/abrir-finan-pendrive.sh"
AREA_TRABALHO="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

if [[ "${1:-}" == "--remover" ]]; then
  rm -f "$DESKTOP_FILE" "$AREA_TRABALHO/finan-pendrive.desktop" "$LAUNCHER"
  update-desktop-database "$APPS" 2>/dev/null || true
  echo "Atalho do pendrive removido."
  exit 0
fi

mkdir -p "$DESTINO" "$APPS" "$ICONES"
install -m 644 "$RAIZ/build/icon.png" "$ICONES/finan.png"

# O lançador que roda no clique: varre os pontos de montagem por Finan.AppImage.
cat > "$LAUNCHER" <<'EOF'
#!/usr/bin/env bash
# Abre o Finan a partir do pendrive. Procura o AppImage em qualquer pendrive
# montado; se não achar, avisa e não abre nada (não cai na cópia local).
set -euo pipefail
shopt -s nullglob
candidatos=(
  /run/media/"$USER"/*/Finan/Finan.AppImage
  /media/"$USER"/*/Finan/Finan.AppImage
  /run/media/"$USER"/*/Finan.AppImage
  /media/"$USER"/*/Finan.AppImage
)
for app in "${candidatos[@]}"; do
  [[ -f "$app" ]] && exec "$app" "$@"
done
msg="Pendrive do Finan não encontrado. Plugue o pendrive e tente de novo."
notify-send -i finan "Finan" "$msg" 2>/dev/null \
  || zenity --error --text="$msg" 2>/dev/null \
  || echo "$msg" >&2
exit 1
EOF
chmod 755 "$LAUNCHER"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Finan (pendrive)
GenericName=Finanças pessoais
Comment=Abre o Finan a partir do pendrive (a cópia viva dos seus dados)
Exec=$LAUNCHER %U
Icon=finan
Terminal=false
Categories=Office;Finance;
Keywords=financas;dinheiro;gastos;cartao;parcelas;orcamento;pendrive;
StartupWMClass=Finan
EOF
chmod 644 "$DESKTOP_FILE"

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$DADOS/icons/hicolor" 2>/dev/null || true

if [[ -d "$AREA_TRABALHO" ]]; then
  install -m 755 "$DESKTOP_FILE" "$AREA_TRABALHO/finan-pendrive.desktop"
  gio set "$AREA_TRABALHO/finan-pendrive.desktop" metadata::trusted true 2>/dev/null || true
fi

echo "Atalho 'Finan (pendrive)' instalado (menu de aplicativos + $AREA_TRABALHO)."
echo "  lançador: $LAUNCHER"
echo "  ao clicar: procura o Finan.AppImage no pendrive; se não estiver plugado, avisa."