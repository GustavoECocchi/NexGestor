import { beforeEach, describe, expect, it } from "vitest"
import { chavesDoFormularioManual, mensagemDeErro, normalizaCampo, num, parseFileJSON } from "~components/NewCampaignModal"
import { ApiError } from "~lib/api"

beforeEach(() => {
  localStorage.clear() // parseFileJSON chama nextLiveId(), que lê localStorage
})

describe("num — parser de número em pt-BR/en-US", () => {
  it("vazio vira undefined (campo omitido do payload)", () => {
    expect(num("")).toBeUndefined()
    expect(num("   ")).toBeUndefined()
  })

  it("formato brasileiro com milhar e decimal", () => {
    expect(num("1.234,56")).toBe(1234.56)
  })

  it("formato americano com decimal", () => {
    expect(num("1234.56")).toBe(1234.56)
  })

  it("inteiro simples", () => {
    expect(num("50")).toBe(50)
  })

  it("lixo não numérico vira undefined, não NaN", () => {
    expect(num("abc")).toBeUndefined()
  })
})

describe("parseFileJSON — a whitelist é a garantia de segurança aqui", () => {
  it("JSON inválido retorna erro claro, não lança exceção", () => {
    const result = parseFileJSON("{ isso não é json")
    expect("error" in result).toBe(true)
  })

  it("número e string na raiz são rejeitados", () => {
    expect("error" in parseFileJSON("42")).toBe(true)
    expect("error" in parseFileJSON('"texto"')).toBe(true)
  })

  it("array na raiz é rejeitado com erro — não vira 'objeto sem campos'", () => {
    // Histórico: este teste nasceu (2026-07-25) documentando o oposto — array
    // na raiz passava, porque `typeof [] === "object"`, e caía nos defaults sem
    // avisar nada. Não era falha de segurança (nenhum dado errado era aceito),
    // mas era uma validação frouxa que devolvia "campanha analisada" para um
    // arquivo que o usuário claramente errou. Corrigido em 2026-07-28 com
    // Array.isArray; a asserção foi invertida junto, não removida.
    const result = parseFileJSON("[1,2,3]")
    expect("error" in result).toBe(true)
  })

  it("campo com nome exato na whitelist vai pro campo certo — nunca por posição", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: 50 } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBe(50)
    expect(result.input.metrics.cpc).toBeUndefined() // nunca vaza pra outro campo
    expect(result.unknownKeys).toEqual([])
    expect(result.invalidTypeKeys).toEqual([])
  })

  it("chave desconhecida é reportada e IGNORADA, nunca aceita silenciosamente", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: 50, campoInventado: 999 } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBe(50)
    expect((result.input.metrics as Record<string, unknown>).campoInventado).toBeUndefined()
    expect(result.unknownKeys).toContain("metrics.campoInventado")
  })

  it("tipo errado (string onde espera number) é reportado e IGNORADO", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: "cinquenta" } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBeUndefined()
    expect(result.invalidTypeKeys).toContain("metrics.cpa")
  })

  it("learning_phase é o único campo booleano — number nele é tipo errado", () => {
    const ok = parseFileJSON(JSON.stringify({ metrics: { learning_phase: true } }))
    if ("error" in ok) throw new Error("não deveria ter erro")
    expect(ok.input.metrics.learning_phase).toBe(true)

    const errado = parseFileJSON(JSON.stringify({ metrics: { learning_phase: 1 } }))
    if ("error" in errado) throw new Error("não deveria ter erro")
    expect(errado.input.metrics.learning_phase).toBeUndefined()
    expect(errado.invalidTypeKeys).toContain("metrics.learning_phase")
  })

  it("mesma regra vale pro bloco targets", () => {
    const result = parseFileJSON(JSON.stringify({ targets: { max_cpa: 80, chaveFalsa: 1, min_roas: "alto" } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.targets.max_cpa).toBe(80)
    expect(result.unknownKeys).toContain("targets.chaveFalsa")
    expect(result.invalidTypeKeys).toContain("targets.min_roas")
  })

  it("Infinity vira null no round-trip do JSON e é tratado como tipo inválido", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: Infinity } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBeUndefined()
    expect(result.invalidTypeKeys).toContain("metrics.cpa")
  })

  it("campaign.name vazio ou ausente cai no nome padrão, nunca fica em branco", () => {
    const semNome = parseFileJSON(JSON.stringify({ campaign: {}, metrics: {} }))
    if ("error" in semNome) throw new Error("não deveria ter erro")
    expect(semNome.input.campaign.name).toBe("Campanha via arquivo")

    const comNome = parseFileJSON(JSON.stringify({ campaign: { name: "Black Friday" }, metrics: {} }))
    if ("error" in comNome) throw new Error("não deveria ter erro")
    expect(comNome.input.campaign.name).toBe("Black Friday")
  })

  it("campaign.objective/platform têm default quando ausentes", () => {
    const result = parseFileJSON(JSON.stringify({ campaign: {}, metrics: {} }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.campaign.objective).toBe("conversion")
    expect(result.input.campaign.platform).toBe("meta_ads")
  })

  it("sem nenhum bloco, ainda retorna um input válido com defaults (não é erro)", () => {
    const result = parseFileJSON("{}")
    expect("error" in result).toBe(false)
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// Regressão 2026-08-01 — campos que faltavam no formulário manual
// ─────────────────────────────────────────────────────────────────────────────

describe("formulário manual — expõe tudo que o engine precisa", () => {
  // Varredura de 60.000 combinações usando só os campos do formulário mostrou
  // que os Cenários D (desalinhamento com a LP), F (lead frio), J (leilão caro)
  // e N (vazamento clique→página) eram INALCANÇÁVEIS: o engine sabia
  // diagnosticá-los, mas não havia onde informar os dados. Mesma armadilha de
  // 2026-07-28 com os campos de aprendizado.
  const chaves = chavesDoFormularioManual()

  it("coleta o que o Cenário N (vazamento clique→página) exige", () => {
    expect(chaves).toContain("link_clicks")
    expect(chaves).toContain("landing_page_views")
  })

  it("coleta o que o Cenário F (lead frio) exige", () => {
    expect(chaves).toContain("cpl")
    expect(chaves).toContain("max_cpl")
  })

  it("coleta o teto de CPM (Cenário J e trava de escala do G)", () => {
    expect(chaves).toContain("max_cpm")
  })

  it("não perdeu nenhum campo que já existia", () => {
    for (const k of ["impressions", "spend", "cpm", "cpc", "cpa", "roas", "hook_rate",
                     "hold_rate", "ctr_link", "ctr_all", "frequency", "conversions",
                     "weekly_conversions", "max_cpa", "min_roas", "min_ctr_link",
                     "min_hook_rate"]) {
      expect(chaves, `campo ${k} sumiu do formulário`).toContain(k)
    }
  })
})

describe("normalizaCampo — campo inteiro não pode virar 422", () => {
  // O backend tipa impressões, cliques, visitas e conversões como int. Um
  // decimal ali devolvia 422 "int_from_float", que chegava ao gestor como
  // "A análise falhou: Falha na análise: 422" — sem dizer qual campo.
  it("arredonda os campos que o backend tipa como inteiro", () => {
    expect(normalizaCampo("impressions", 120000.5)).toBe(120001)
    expect(normalizaCampo("link_clicks", 1600.4)).toBe(1600)
    expect(normalizaCampo("landing_page_views", 300.6)).toBe(301)
    expect(normalizaCampo("conversions", 21.5)).toBe(22)
    expect(normalizaCampo("weekly_conversions", 20.2)).toBe(20)
  })

  it("não mexe em métrica decimal legítima", () => {
    expect(normalizaCampo("cpa", 95.37)).toBe(95.37)
    expect(normalizaCampo("roas", 1.25)).toBe(1.25)
    expect(normalizaCampo("frequency", 3.4)).toBe(3.4)
    expect(normalizaCampo("spend", 2000.99)).toBe(2000.99)
  })

  it("a importação de JSON recebe o mesmo tratamento", () => {
    const r = parseFileJSON(JSON.stringify({
      metrics: { impressions: 50000.7, link_clicks: 900.2, cpa: 49.99 }
    }))
    expect("error" in r).toBe(false)
    if ("error" in r) return
    expect(r.input.metrics.impressions).toBe(50001)
    expect(r.input.metrics.link_clicks).toBe(900)
    expect(r.input.metrics.cpa).toBe(49.99)
  })
})

describe("mensagemDeErro — o que o usuário lê quando a análise falha", () => {
  const REMOTO = "https://gestor.nexgold.com.br"
  const LOCAL = "http://localhost:8000"

  describe("erro já escrito para o usuário (ApiError)", () => {
    it("mostra o texto como está, sem embrulhar em 'A análise falhou'", () => {
      const e = new ApiError(
        "O servidor está recebendo muitas análises agora. Espere um minuto e tente de novo."
      )
      const out = mensagemDeErro(e, REMOTO, false)

      expect(out).toBe(e.message)
      // O embrulho contradiria a mensagem: manda procurar defeito nos dados
      // da campanha quando o problema é só o servidor estar ocupado.
      expect(out).not.toMatch(/análise falhou/i)
    })

    it("vale igual no build local", () => {
      const e = new ApiError("O servidor não respondeu em 30s. Tente de novo em alguns minutos.")
      expect(mensagemDeErro(e, LOCAL, true)).toBe(e.message)
    })
  })

  describe("sem rede — a instrução muda com o tipo de build", () => {
    const semRede = new TypeError("Failed to fetch")

    it("build da equipe não manda o usuário 'subir o backend'", () => {
      const out = mensagemDeErro(semRede, REMOTO, false, true)

      expect(out).toContain(REMOTO)
      expect(out).not.toMatch(/localhost/i)
      expect(out).not.toMatch(/uvicorn/i)
    })

    it("build local dá a instrução de desenvolvedor", () => {
      const out = mensagemDeErro(semRede, LOCAL, true, true)

      expect(out).toContain(LOCAL)
      expect(out).toMatch(/uvicorn/i)
    })

    it("reconhece também o texto do Firefox ('NetworkError')", () => {
      const out = mensagemDeErro(new TypeError("NetworkError when attempting to fetch resource."), REMOTO, false, true)
      expect(out).not.toMatch(/análise falhou/i)
    })
  })

  describe("'Failed to fetch' é ambíguo — a mensagem não pode culpar a internet", () => {
    // Medido no servidor em 14/08/2026: o 429 do limite de requisições é
    // gerado pelo nginx e sai SEM cabeçalho CORS (o 200, que vem do backend,
    // sai com ele). O Chrome então bloqueia a resposta antes do código ler o
    // status, e o erro chega como "Failed to fetch" — indistinguível de queda
    // de rede. Com a equipe atrás do mesmo IP (NAT), isto vai acontecer.
    const semRede = new TypeError("Failed to fetch")

    it("com o navegador online, cita as duas causas possíveis", () => {
      const out = mensagemDeErro(semRede, REMOTO, false, true)

      expect(out).toMatch(/muitas análises|excesso de análises/i)
      // Não pode AFIRMAR que é a internet do usuário: `onLine: true` não
      // prova conexão, e a causa provável é o limite do servidor.
      expect(out).not.toMatch(/verifique sua conexão/i)
    })

    it("offline de verdade é o único caso em que afirma ser a internet", () => {
      const out = mensagemDeErro(semRede, REMOTO, false, false)

      expect(out).toMatch(/sem conexão/i)
      expect(out).not.toMatch(/excesso de análises/i)
    })

    it("no build local o offline não muda a instrução (localhost roda sem internet)", () => {
      expect(mensagemDeErro(semRede, LOCAL, true, false)).toMatch(/uvicorn/i)
    })
  })

  describe("erro inesperado", () => {
    it("preserva o detalhe técnico — é o que permite diagnosticar", () => {
      const out = mensagemDeErro(new Error("Falha na análise: 500"), REMOTO, false)
      expect(out).toContain("500")
    })

    it("aceita coisa que nem é Error sem quebrar a tela", () => {
      expect(mensagemDeErro("pane geral", REMOTO, false)).toContain("pane geral")
      expect(() => mensagemDeErro(null, REMOTO, false)).not.toThrow()
      expect(() => mensagemDeErro(undefined, REMOTO, false)).not.toThrow()
    })
  })
})
