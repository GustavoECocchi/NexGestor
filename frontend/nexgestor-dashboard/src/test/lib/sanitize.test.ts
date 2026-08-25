import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "~lib/sanitize"

describe("sanitizeHtml — casos honestos (o que a UI realmente usa)", () => {
  it("mantém texto puro", () => {
    expect(sanitizeHtml("CPA em R$ 50,00")).toBe("CPA em R$ 50,00")
  })

  it("reativa as tags da allowlist sem atributos", () => {
    expect(sanitizeHtml("<b>Cenário E</b> — fadiga")).toBe("<b>Cenário E</b> — fadiga")
    expect(sanitizeHtml("<strong>alerta</strong>")).toBe("<strong>alerta</strong>")
    expect(sanitizeHtml("<i>nota</i> <em>ênfase</em>")).toBe("<i>nota</i> <em>ênfase</em>")
  })

  it("normaliza <br> e <br/> pra <br/>", () => {
    expect(sanitizeHtml("linha 1<br>linha 2")).toBe("linha 1<br/>linha 2")
    expect(sanitizeHtml("linha 1<br/>linha 2")).toBe("linha 1<br/>linha 2")
  })

  it("null/undefined/vazio viram string vazia", () => {
    expect(sanitizeHtml(null)).toBe("")
    expect(sanitizeHtml(undefined)).toBe("")
    expect(sanitizeHtml("")).toBe("")
  })
})

describe("sanitizeHtml — tentativas de XSS (o motivo desta função existir)", () => {
  it("escapa <script> por completo", () => {
    const out = sanitizeHtml("<script>alert(1)</script>")
    expect(out).not.toContain("<script>")
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;")
  })

  it("escapa handler inline em tag não permitida", () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">')
    expect(out).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(out).not.toContain("<img")
  })

  it("não deixa injetar atributo numa tag da allowlist", () => {
    // "<b onmouseover=alert(1)>" não bate no regex de abertura permitida
    // (que exige fechamento imediato: <b>, <b/> — nada entre o "b" e o "&gt;"
    // além de espaço/barra), então a ABERTURA fica escapada como texto — o
    // atributo malicioso nunca vira parte de uma tag real. O "</b>" de
    // fechamento sozinho é reativado normalmente, mas isso é inofensivo:
    // uma tag de fechamento não carrega atributos executáveis.
    const out = sanitizeHtml('<b onmouseover="alert(1)">texto</b>')
    expect(out).toBe('&lt;b onmouseover=&quot;alert(1)&quot;&gt;texto</b>')
    expect(out).not.toMatch(/<b[\s>]/) // nenhuma ABERTURA <b ...> de verdade foi criada
  })

  it("tags maiúsculas/mistas da allowlist ainda funcionam (case-insensitive)", () => {
    expect(sanitizeHtml("<B>forte</B>")).toBe("<b>forte</b>")
  })

  it("tag desconhecida permanece escapada mesmo se parecida com a allowlist", () => {
    expect(sanitizeHtml("<button>clique</button>")).toBe("&lt;button&gt;clique&lt;/button&gt;")
  })

  it("nunca produz um '<' cru fora das tags reativadas", () => {
    const hostile = `<svg onload=alert(1)><iframe src="javascript:alert(2)"></iframe>${"<".repeat(5)}b>`
    const out = sanitizeHtml(hostile)
    // todo "<" que sobra no resultado só pode pertencer a uma tag da allowlist
    const leftoverOpens = out.match(/<(?!\/?(b|strong|i|em|br)\/?>)/gi)
    expect(leftoverOpens).toBeNull()
  })

  it("aspas e & são escapados (evita fechar atributo/city entities falsas)", () => {
    expect(sanitizeHtml(`ele disse "oi" & tchau`)).toBe("ele disse &quot;oi&quot; &amp; tchau")
  })
})
