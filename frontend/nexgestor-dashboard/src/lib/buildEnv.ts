/**
 * Auditoria de rede (2026-09-03), achado A1: `npm run build` sem
 * `VITE_API_BASE` no ambiente produz um bundle apontando para
 * `http://localhost:8000` (fallback de dev, ver `api.ts`) — confirmado
 * inspecionando `dist/assets/*.js` depois de um build sem a variável. Servido
 * via HTTPS isso é mixed content: falha 100% das análises, sem nenhum aviso
 * no momento do build.
 *
 * Extraída para cá (em vez de inline no `vite.config.ts`) só para ser
 * testável pelo Vitest sem precisar rodar um `vite build` de verdade a cada
 * teste — `vite.config.ts` roda em Node, fora do alcance normal da suíte.
 */
export function assertApiBaseParaProducao(mode: string, apiBase: string | undefined): void {
  if (mode !== "production") return // `vite dev` sempre pode cair no fallback de localhost

  // Revisão do Opus (2026-09-04), achado R2: a versão original só checava
  // AUSÊNCIA da variável. `.env.example` traz `VITE_API_BASE=http://localhost:8000`
  // como valor de exemplo, e `deploy/README.md` ensina `cp .env.example .env`
  // — o caminho documentado levava de volta ao MESMO bundle quebrado que este
  // guard existe para impedir. Provado: com essa variável definida (não
  // ausente) o build antigo passava e o bundle continha "localhost:8000".
  if (!apiBase) {
    throw new Error(
      "VITE_API_BASE não definido para build de produção. Sem isso o bundle sai apontando para " +
        "http://localhost:8000 (fallback de dev) e a análise falha 100% das vezes quando servido via " +
        "HTTPS (mixed content). Defina VITE_API_BASE no .env antes de rodar o build (ver .env.example)."
    )
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(apiBase)) {
    throw new Error(
      `VITE_API_BASE="${apiBase}" aponta para localhost num build de produção — provavelmente o valor ` +
        "de exemplo do .env.example, copiado sem editar. Aponte para o backend real (ex.: " +
        "https://gestor.nexgold.com.br) antes de rodar o build."
    )
  }
}
