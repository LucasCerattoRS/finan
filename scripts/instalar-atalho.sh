#!/usr/bin/env bash
# Instala o Finan no Linux: coloca o AppImage num lugar estável, registra o
# ícone e cria o atalho no menu de aplicativos (e na Área de trabalho).
#
#   ./scripts/instalar-atalho.sh            # instala/atualiza
#   ./scripts/instalar-atalho.sh --remover  # desinstala o atalho
#
# O AppImage NÃO fica em dist/ porque `npm run dist:linux` apaga essa pasta a
# cada build — e o dados.json vive ao lado do executável. Ele é copiado para
# ~/.local/share/Finan, que sobrevive aos rebuilds.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DADOS="${XDG_DATA_HOME:-$HOME/.local/share}"
DESTINO="$DADOS/Finan"
APPS="$DADOS/applications"
ICONES="$DADOS/icons/hicolor/512x512/apps"
DESKTOP_FILE="$APPS/finan.desktop"
AREA_TRABALHO="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

# Restos da versão anterior, quando o app se chamava FinanWise.
limpar_antigo() {
  rm -f "$APPS/finanwise.desktop" "$AREA_TRABALHO/finanwise.desktop" "$ICONES/finanwise.png"
  # só remove a pasta antiga se ela não tiver dados dentro
  if [[ -d "$DADOS/FinanWise" && ! -e "$DADOS/FinanWise/dados.json" ]]; then
    rm -rf "$DADOS/FinanWise"
  fi
}

if [[ "${1:-}" == "--remover" ]]; then
  rm -f "$DESKTOP_FILE" "$AREA_TRABALHO/finan.desktop" "$ICONES/finan.png"
  limpar_antigo
  update-desktop-database "$APPS" 2>/dev/null || true
  echo "Atalho removido. Seus dados continuam em $DESTINO/dados.json"
  exit 0
fi

APPIMAGE="$(ls -t "$RAIZ"/dist/Finan-*.AppImage 2>/dev/null | head -1 || true)"
if [[ -z "$APPIMAGE" ]]; then
  echo "Nenhum AppImage em dist/. Rode antes:  npm run dist:linux" >&2
  exit 1
fi

limpar_antigo
mkdir -p "$DESTINO" "$APPS" "$ICONES"

# Só o executável é sobrescrito; o dados.json ao lado dele nunca é tocado.
install -m 755 "$APPIMAGE" "$DESTINO/Finan.AppImage"
install -m 644 "$RAIZ/build/icon.png" "$ICONES/finan.png"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Finan
GenericName=Finanças pessoais
Comment=Gestor de finanças pessoais offline (entradas, saídas, cartões e parcelas)
Exec=$DESTINO/Finan.AppImage %U
Icon=finan
Terminal=false
Categories=Office;Finance;
Keywords=financas;dinheiro;gastos;cartao;parcelas;orcamento;
StartupWMClass=Finan
EOF
chmod 644 "$DESKTOP_FILE"

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$DADOS/icons/hicolor" 2>/dev/null || true

# Cópia na Área de trabalho (o GNOME exige o arquivo executável e "confiável").
if [[ -d "$AREA_TRABALHO" ]]; then
  install -m 755 "$DESKTOP_FILE" "$AREA_TRABALHO/finan.desktop"
  gio set "$AREA_TRABALHO/finan.desktop" metadata::trusted true 2>/dev/null || true
fi

echo "Finan instalado."
echo "  app:    $DESTINO/Finan.AppImage"
echo "  dados:  $DESTINO/dados.json  (fica ao lado do app; começa vazio)"
echo "  atalho: menu de aplicativos + $AREA_TRABALHO"
