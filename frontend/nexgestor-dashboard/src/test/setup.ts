import "@testing-library/jest-dom/vitest"

// `window.matchMedia` não existe no jsdom, mas existe em qualquer navegador
// real — é lacuna do ambiente de teste, não do produto. Sem este stub,
// qualquer teste que renderize a árvore (Header → useTheme) quebra com
// "matchMedia is not a function".
//
// Só define se ainda não existir: os testes de `theme`/`countup` instalam a
// própria versão (ou a REMOVEM de propósito, para exercitar o caminho em que
// ela falta) e precisam continuar mandando no próprio ambiente.
// Mesmo caso do `matchMedia` acima: o jsdom não implementa `scrollIntoView`
// (não há layout nem viewport para rolar), mas todo navegador implementa.
// Sem o stub, qualquer teste que acione o atalho do Copiloto — ou que faça o
// próprio Copiloto rolar até a última mensagem — quebra com "not a function",
// e a falha seria do ambiente, não do produto. É um no-op: quem quiser afirmar
// que a rolagem foi pedida instala o próprio espião com `vi.spyOn`.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {}
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}
