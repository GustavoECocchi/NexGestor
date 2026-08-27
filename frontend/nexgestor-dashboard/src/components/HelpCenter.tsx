import { IconChat, IconPlus, IconSpark, IconTrash } from "~components/Icons"

/**
 * Central de Ajuda — fase-2, AC5.
 *
 * Responde às 4 perguntas que a equipe levantou (criar / checar / excluir /
 * usar a IA) em português simples, para quem não tem bagagem de marketing.
 *
 * REGRA EDITORIAL, e ela não é cosmética — é a fronteira que separa esta tela
 * da fase-1 (`docs/prds/fase-2-dashboard-intuitividade.md`, "Sobreposições a
 * resolver"): aqui se explica **fluxo** ("onde eu clico para apagar"), nunca
 * **campo** ("o que é CPA"). O significado de cada métrica já é explicado pelo
 * ícone `?` de cada campo do formulário (`FieldHint`), e repetir isso aqui
 * criaria duas fontes para a mesma resposta — que divergiriam na primeira vez
 * que alguém atualizasse só uma delas. Quando o texto precisar tocar num
 * termo, aponte para onde ele já é explicado, como o passo 3 de "Como crio"
 * faz.
 */

type Passo = { texto: React.ReactNode; nota?: string }

function Bloco({
  icone,
  pergunta,
  passos,
  rodape
}: {
  icone: React.ReactNode
  pergunta: string
  passos: Passo[]
  rodape?: React.ReactNode
}) {
  return (
    <section className="help-bloco">
      <div className="help-bloco-hd">
        <span className="help-ico">{icone}</span>
        <h3>{pergunta}</h3>
      </div>
      <ol className="help-passos">
        {passos.map((p, i) => (
          <li key={i}>
            <span className="help-n">{i + 1}</span>
            <div>
              {p.texto}
              {p.nota && <span className="help-nota">{p.nota}</span>}
            </div>
          </li>
        ))}
      </ol>
      {rodape && <div className="help-rodape">{rodape}</div>}
    </section>
  )
}

export function HelpCenter({ onNova }: { onNova: () => void }) {
  return (
    <div className="scroll fade-in">
      <div className="help-intro">
        <h2>Como usar o NexGestor</h2>
        <p>
          Você descreve uma campanha, a ferramenta diz o que está travando e o
          que fazer a respeito. Abaixo, as quatro coisas que dá para fazer aqui
          — sem precisar saber nada de marketing antes.
        </p>
      </div>

      <Bloco
        icone={<IconPlus />}
        pergunta="Como eu crio uma campanha?"
        passos={[
          { texto: <>Clique em <b>Nova campanha</b>, no menu à esquerda. Ele está sempre lá, de qualquer tela.</> },
          { texto: "Preencha os números da sua campanha no formulário (quanto gastou, quantos cliques teve, quantas vendas saíram)." },
          {
            texto: "Não sabe o que um campo quer dizer? Passe o mouse no ícone “?” ao lado do nome dele.",
            nota: "Cada campo explica o próprio termo ali mesmo — você não precisa decorar sigla nenhuma."
          },
          { texto: "Clique em “Analisar campanha”. O diagnóstico abre na hora." }
        ]}
        rodape={
          <button className="help-cta" onClick={onNova}>
            <IconPlus />
            Criar uma campanha agora
          </button>
        }
      />

      <Bloco
        icone={<IconSpark />}
        pergunta="Como eu vejo a análise de uma campanha?"
        passos={[
          { texto: <>Clique em <b>Campanhas</b>, no menu à esquerda.</> },
          {
            texto: "Cada cartão da lista já mostra a conclusão: uma cor de status e uma frase dizendo o que fazer.",
            nota: "Verde e azul são boas notícias; amarelo pede atenção; vermelho pede ação agora."
          },
          { texto: "Clique no cartão para abrir a análise completa — nota de saúde, o que está travando, por quê, e as ações em ordem de prioridade." }
        ]}
      />

      <Bloco
        icone={<IconTrash />}
        pergunta="Como eu apago uma campanha?"
        passos={[
          { texto: "Na lista de campanhas, passe o mouse sobre o cartão que quer apagar." },
          { texto: "Clique no ícone de lixeira que aparece no canto do cartão." },
          {
            texto: "Confirme em “Apagar para todo o time?”.",
            nota: "A palavra “time” é literal: quem usa a mesma identificação que você deixa de ver essa campanha também. Não dá para desfazer."
          }
        ]}
        rodape={
          <>
            As campanhas marcadas como <b>exemplo</b> não têm lixeira — elas não
            são suas, servem só para você explorar a ferramenta antes de
            analisar a sua primeira campanha.
          </>
        }
      />

      {/* AC4. Os dois blocos abaixo existem separados de propósito: o selo do
          cabeçalho e o Copiloto são coisas diferentes, e tratá-los como a mesma
          é exatamente a confusão que este PRD precisa evitar. */}
      <Bloco
        icone={<IconChat />}
        pergunta="Como eu uso a IA?"
        passos={[
          { texto: "Abra uma campanha (passo anterior). Dentro dela, procure o botão “Perguntar ao Copiloto”, no topo." },
          { texto: "Escreva a pergunta em português normal — “por que isso está acontecendo?”, “vale investir mais?” — ou clique numa das perguntas prontas." },
          {
            texto: "A resposta usa só os números da sua campanha.",
            nota: "Se um dado não foi informado, o Copiloto diz que não tem esse dado em vez de inventar um número."
          }
        ]}
        rodape={
          <>
            <b>Não confunda com o selo “IA” do topo da tela.</b> Aquele selo diz
            se o servidor está com a inteligência artificial disponível agora
            (ligada, desligada ou com problema) — é o estado da ferramenta. O
            Copiloto é com quem você conversa sobre uma campanha específica.
          </>
        }
      />
    </div>
  )
}
