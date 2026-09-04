import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { assertApiBaseParaProducao } from "./src/lib/buildEnv.js"

// Alias "~*" → "./src/*", mesma convenção do repo (extensão usa o mesmo
// padrão via Plasmo). "~style.css" e "~assets/logo.png" resolvem para
// "src/style.css" e "src/assets/logo.png".
export default defineConfig(({ mode }) => {
  // Terceiro argumento vazio: sem isso `loadEnv` só devolve variáveis com
  // prefixo VITE_ — que é o nosso caso, mas ser explícito evita surpresa se
  // uma env sem prefixo precisar ser lida aqui no futuro.
  const env = loadEnv(mode, process.cwd(), "")
  // Auditoria de rede (2026-09-03), achado A1 — falha o build de produção
  // sem VITE_API_BASE em vez de deixar passar um bundle apontando pro
  // fallback de dev (ver src/lib/buildEnv.ts).
  assertApiBaseParaProducao(mode, env.VITE_API_BASE)

  return {
    plugins: [react()],
    resolve: {
      alias: [{ find: /^~(.*)$/, replacement: path.resolve(import.meta.dirname, "src/$1") }]
    }
  }
})
