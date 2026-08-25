import "@testing-library/jest-dom/vitest"

// `window.matchMedia` não existe no jsdom, mas existe em qualquer navegador
// real — é lacuna do ambiente de teste, não do produto. Sem este stub,
// qualquer teste que renderize a árvore (Header → useTheme) quebra com
// "matchMedia is not a function".
//
// Só define se ainda não existir: os testes de `theme`/`countup` instalam a
// própria versão (ou a REMOVEM de propósito, para exercitar o caminho em que
// ela falta) e precisam continuar mandando no próprio ambiente.
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
