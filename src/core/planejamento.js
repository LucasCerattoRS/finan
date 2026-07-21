// planejamento.js — orçamento mensal (estimado × real por categoria).
// Era a aba "Planejamento PM" da planilha (macro salvarPlanejamentoPM): você diz
// quanto PRETENDE gastar em cada categoria no mês; aqui isso fica lado a lado com
// o REAL (gastoPorCategoria, que já soma as parcelas do cartão) e a diferença.
// Puro, sem DOM — as mutações (definir/repetir/remover) ficam no index.js, como
// as das outras entidades.

import { paraCentavos, paraReais } from './model.js';
import { gastoPorCategoria } from './calculos.js';

// Orçamento de um mês: junta o estimado (o que você planejou) com o real (o que
// saiu), por categoria. `diferenca = estimado - real`: positivo = ainda cabe no
// orçamento; negativo = estourou. Mostra também categorias SEM meta que tiveram
// gasto — senão o "estourei o mês" ficaria escondido. Retorna itens ordenados
// (planejadas primeiro, maior orçamento no topo) e os totais.
export function planejamentoDoMes(estado, mes) {
  const estimados = new Map();
  for (const p of estado.planejamentos || []) {
    if (p.mes === mes) {
      estimados.set(p.categoria, (estimados.get(p.categoria) || 0) + Number(p.estimado || 0));
    }
  }
  const reais = new Map();
  for (const { categoria, valor } of gastoPorCategoria(estado, mes)) {
    reais.set(categoria, valor);
  }

  const categorias = new Set([...estimados.keys(), ...reais.keys()]);
  const itens = [...categorias].map((categoria) => {
    const estimado = estimados.get(categoria) || 0;
    const real = reais.get(categoria) || 0;
    return {
      categoria,
      estimado,
      real,
      // em centavos para não herdar erro de float na subtração
      diferenca: paraReais(paraCentavos(estimado) - paraCentavos(real)),
      planejado: estimados.has(categoria),
    };
  });

  // planejadas primeiro (maior orçamento no topo); depois o que gastou sem meta.
  itens.sort((a, b) => (
    a.planejado === b.planejado
      ? (b.estimado - a.estimado) || (b.real - a.real)
      : (a.planejado ? -1 : 1)
  ));

  const totalEstimadoCent = itens.reduce((s, i) => s + paraCentavos(i.estimado), 0);
  const totalRealCent = itens.reduce((s, i) => s + paraCentavos(i.real), 0);
  return {
    mes,
    itens,
    totalEstimado: paraReais(totalEstimadoCent),
    totalReal: paraReais(totalRealCent),
    diferenca: paraReais(totalEstimadoCent - totalRealCent),
  };
}
