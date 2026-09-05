import { beforeEach, describe, expect, it } from "vitest"

import {
  aplicarBenchmarkNaLive, loadLive, marcarComoSalva, marcarFalhaPermanente,
  mesclarComServidor, registrarAvisoTransitorio, removeLive, upsertLive
} from "~lib/store"
import type { BenchmarkReferencia, CampaignVM } from "~types"

/**
 * Corridas de persistência reproduzidas pela revisão Opus de 2026-09-05.
 *
 * As três primeiras FALHAVAM antes da correção: `marcarComoSalva` escrevia o
 * snapshot `vm` por cima do estado atual (apagando o enriquecimento) e
 * recriava campanha já apagada; `mesclarComServidor` sobrescrevia o local
 * com o payload do servidor (gravado antes do benchmark chegar).
 */

const REFS: BenchmarkReferencia[] = [
  { metric: "CTR Link", value: 1.5, fonte: "WordStream", fonte_url: "https://w.example/x", capturado_em: "2026-09-05T00:00:00Z" }
]

function vm(over: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1000, name: "C", clientId: "cid-1",
    tiles: [], scenarios: [], actions: [], sugg: [], ...over
  } as CampaignVM
}

beforeEach(() => localStorage.clear())

describe("marcarComoSalva — mescla sobre o estado atual", () => {
  it("preserva o benchmark que chegou DEPOIS do save começar", () => {
    const v = vm()
    upsertLive(v)
    aplicarBenchmarkNaLive("cid-1", REFS) // enriquecimento resolve no meio do save
    marcarComoSalva(v, 42, 1001)          // save volta com o snapshot ANTIGO

    const [salva] = loadLive()
    expect(salva.benchmarks).toHaveLength(1)
    expect(salva.serverId).toBe(42)
    expect(salva.id).toBe(1001)
  })

  it("NÃO ressuscita campanha apagada durante o save", () => {
    const v = vm()
    upsertLive(v)
    removeLive(1000)
    marcarComoSalva(v, 42, 1001) // resposta do save chega depois do delete
    expect(loadLive()).toEqual([])
  })

  it("preserva outras edições feitas no meio do caminho", () => {
    const v = vm()
    upsertLive(v)
    registrarAvisoTransitorio(v, "base cheia")
    aplicarBenchmarkNaLive("cid-1", REFS)
    marcarComoSalva(v, 42, 1001)

    const [salva] = loadLive()
    expect(salva.benchmarks).toHaveLength(1)
    expect(salva.syncAviso).toBeUndefined() // limpo no sucesso, como sempre
  })

  it("não confunde duas campanhas simultâneas", () => {
    const a = vm({ id: 1000, clientId: "cid-a", name: "A" })
    const b = vm({ id: 1001, clientId: "cid-b", name: "B" })
    upsertLive(a)
    upsertLive(b)
    aplicarBenchmarkNaLive("cid-b", REFS)
    marcarComoSalva(a, 10, 2000)

    const lista = loadLive()
    expect(lista.find((c) => c.clientId === "cid-a")?.serverId).toBe(10)
    expect(lista.find((c) => c.clientId === "cid-b")?.serverId).toBeUndefined()
    expect(lista.find((c) => c.clientId === "cid-b")?.benchmarks).toHaveLength(1)
  })
})

describe("mesclarComServidor — não apaga enriquecimento local", () => {
  it("preserva benchmarks quando o payload do servidor ainda não os tem", () => {
    const v = vm({ serverId: 42, id: 1001 })
    upsertLive(v)
    aplicarBenchmarkNaLive("cid-1", REFS)
    mesclarComServidor([{ ...v }]) // servidor devolve a versão pré-benchmark

    expect(loadLive()[0].benchmarks).toHaveLength(1)
  })

  it("o servidor vence quando JÁ tem benchmarks (não ressuscita versão local velha)", () => {
    const v = vm({ serverId: 42, id: 1001 })
    upsertLive(v)
    aplicarBenchmarkNaLive("cid-1", REFS)
    const doServidor = { ...v, benchmarks: [{ ...REFS[0], fonte: "Mais nova" }] }
    mesclarComServidor([doServidor])

    expect(loadLive()[0].benchmarks?.[0].fonte).toBe("Mais nova")
  })

  it("campanha local sem serverId continua preservada", () => {
    upsertLive(vm())
    mesclarComServidor([])
    expect(loadLive()).toHaveLength(1)
  })
})

describe("callbacks tardios não recriam nem confundem campanha", () => {
  it("marcarFalhaPermanente em campanha apagada é no-op", () => {
    const v = vm()
    upsertLive(v)
    removeLive(1000)
    expect(marcarFalhaPermanente(v, "grande demais")).toEqual([])
  })

  it("registrarAvisoTransitorio em campanha apagada é no-op", () => {
    const v = vm()
    upsertLive(v)
    removeLive(1000)
    expect(registrarAvisoTransitorio(v, "base cheia")).toEqual([])
  })

  it("encontra a campanha mesmo depois do id ter mudado na reancoragem", () => {
    const v = vm()
    upsertLive(v)
    marcarComoSalva(v, 42, 1001) // id 1000 -> 1001
    // O callback tardio ainda carrega o snapshot com id 1000; o clientId salva.
    registrarAvisoTransitorio(v, "aviso tardio")
    expect(loadLive()[0].syncAviso).toBe("aviso tardio")
  })

  it("aplicarBenchmarkNaLive em campanha apagada é no-op", () => {
    upsertLive(vm())
    removeLive(1000)
    expect(aplicarBenchmarkNaLive("cid-1", REFS)).toEqual([])
  })
})
