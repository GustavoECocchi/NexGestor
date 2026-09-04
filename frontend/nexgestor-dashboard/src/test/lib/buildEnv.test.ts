import { describe, expect, it } from "vitest"
import { assertApiBaseParaProducao } from "~lib/buildEnv"

// Auditoria de rede (2026-09-03), A1 — a lógica mora aqui, e não só inline em
// `vite.config.ts`, exatamente para ser testável sem spawnar um `vite build`
// de verdade a cada rodada da suíte.
describe("assertApiBaseParaProducao", () => {
  it("build de produção sem VITE_API_BASE falha alto, com mensagem acionável", () => {
    expect(() => assertApiBaseParaProducao("production", undefined)).toThrow(/VITE_API_BASE/)
  })

  it("string vazia conta como 'não definido' (mesmo risco de cair no fallback)", () => {
    expect(() => assertApiBaseParaProducao("production", "")).toThrow(/VITE_API_BASE/)
  })

  it("build de produção COM VITE_API_BASE não lança", () => {
    expect(() => assertApiBaseParaProducao("production", "https://gestor.nexgold.com.br")).not.toThrow()
  })

  it("modo development nunca lança, mesmo sem a variável — dev pode cair no fallback de localhost", () => {
    expect(() => assertApiBaseParaProducao("development", undefined)).not.toThrow()
  })

  it("outros modos (ex: test) também não lançam — só 'production' é guardado", () => {
    expect(() => assertApiBaseParaProducao("test", undefined)).not.toThrow()
  })
})

// Revisão do Opus (2026-09-04), achado R2: a versão original só checava
// AUSÊNCIA da variável. `.env.example` trazia `VITE_API_BASE=http://localhost:8000`
// como valor ATIVO (não comentado) — um `cp .env.example .env` sem editar
// produzia exatamente o bundle quebrado que o guard existia para impedir.
describe("assertApiBaseParaProducao — valor presente mas apontando pra localhost (R2)", () => {
  it("localhost:8000 (o valor do .env.example) lança em produção", () => {
    expect(() => assertApiBaseParaProducao("production", "http://localhost:8000")).toThrow(/localhost/i)
  })

  it("127.0.0.1 também lança", () => {
    expect(() => assertApiBaseParaProducao("production", "http://127.0.0.1:8000")).toThrow(/localhost|127\.0\.0\.1/i)
  })

  it("qualquer porta de localhost lança, não só a 8000", () => {
    expect(() => assertApiBaseParaProducao("production", "http://localhost:5173")).toThrow()
  })

  it("um domínio que só CONTÉM 'localhost' no meio não é falso-positivo", () => {
    expect(() => assertApiBaseParaProducao("production", "https://not-localhost.example.com")).not.toThrow()
  })

  it("host real de produção não lança", () => {
    expect(() => assertApiBaseParaProducao("production", "https://gestor.nexgold.com.br")).not.toThrow()
  })

  it("em dev, localhost continua sendo o valor CORRETO — não lança", () => {
    expect(() => assertApiBaseParaProducao("development", "http://localhost:8000")).not.toThrow()
  })
})
