#!/usr/bin/env python3
"""Converte o extrato .xls do BTG Pactual num CSV que o Finan importa.

    python3 scripts/btg-para-csv.py ~/Downloads/Extrato_*.xls

Gera um .csv ao lado de cada .xls. Depois é só soltar o CSV na tela Importar.

Por que existe: o BTG só exporta PDF e .xls (Excel binário, gerado pelo
JasperReports) — não tem OFX nem CSV. Ler .xls binário em JS custaria uma
dependência pesada no app; aqui é um script de 40 linhas.

Precisa do xlrd:  pip install --user xlrd
"""
import csv
import sys
from pathlib import Path

try:
    import xlrd
except ImportError:
    sys.exit("Falta o xlrd. Rode:  pip install --user xlrd")

# Linhas que não são lançamento: o BTG intercala o saldo do dia no meio do extrato.
NAO_E_LANCAMENTO = {"saldo diario", "saldo diário", "saldo anterior", "saldo atual"}


def converter(caminho: Path) -> Path:
    wb = xlrd.open_workbook(str(caminho))
    sh = wb.sheet_by_index(0)

    # acha a linha do cabeçalho ("Data e hora ... Valor") — a posição varia
    cab = next(
        (r for r in range(sh.nrows)
         if any("data e hora" in str(c.value).strip().lower() for c in sh.row(r))),
        None,
    )
    if cab is None:
        sys.exit(f"{caminho.name}: não achei o cabeçalho do extrato.")

    col = {str(c.value).strip().lower(): i for i, c in enumerate(sh.row(cab)) if str(c.value).strip()}
    i_data, i_valor = col["data e hora"], col["valor"]
    i_desc, i_trans = col.get("descrição"), col.get("transação")

    linhas = []
    for r in range(cab + 1, sh.nrows):
        linha = sh.row(r)
        data = str(linha[i_data].value).strip()
        desc = str(linha[i_desc].value).strip() if i_desc is not None else ""
        trans = str(linha[i_trans].value).strip() if i_trans is not None else ""
        valor = str(linha[i_valor].value).strip()

        if not data or not valor:
            continue
        if desc.lower() in NAO_E_LANCAMENTO or not trans:
            continue  # linha de saldo, não é movimento

        # "Pix enviado - Fulano" casa melhor com as regras do que só "Fulano"
        descricao = f"{trans} - {desc}".strip(" -")
        linhas.append([data.split()[0], descricao, valor])

    destino = caminho.with_suffix(".csv")
    with open(destino, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Data", "Descricao", "Valor"])
        w.writerows(linhas)
    print(f"{caminho.name} -> {destino.name}  ({len(linhas)} lançamentos)")
    return destino


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for arg in sys.argv[1:]:
        converter(Path(arg).expanduser())
