# Como usar o NexGestor

Guia para instalar a ferramenta no seu computador. **Leva uns 2 minutos** e você
só faz isso **uma vez**.

Não precisa instalar Python, nem programa nenhum, nem deixar janela aberta. O
"motor" da análise roda num servidor da empresa — o seu computador só precisa de
**internet** e do navegador.

---

## Antes de começar: o que você precisa

1. **Um navegador Chrome, Brave ou Edge.** (Não funciona no Firefox nem no Safari.)
2. **O arquivo da extensão**, que o time te enviou: um `.zip` chamado
   `nexgestor-extensao-<data>.zip` — por exemplo `nexgestor-extensao-20260810.zip`.
   O número no final é só a data da versão.

---

## Passo 1 — Descompactar o arquivo

Clique com o botão direito no `.zip` → **Extrair tudo** (ou "Extrair aqui").
Vai aparecer uma **pasta** com o mesmo nome.

> 📌 **Guarde essa pasta num lugar fixo** (ex.: uma pasta "NexGestor" em
> Documentos). A extensão vai "morar" ali — se você apagar ou mover essa pasta
> depois, a ferramenta para de funcionar.

> ⚠️ Precisa **extrair** mesmo. Só abrir o zip por cima e olhar o conteúdo não
> serve — o navegador não aceita uma pasta que ainda está dentro do zip.

---

## Passo 2 — Instalar a extensão no navegador

1. Copie o endereço abaixo, conforme o seu navegador, cole na barra de endereço
   e aperte Enter:
   - **Chrome:** `chrome://extensions`
   - **Brave:** `brave://extensions`
   - **Edge:** `edge://extensions`
2. Ligue o **Modo do desenvolvedor** (botãozinho no canto superior direito).
3. Clique em **Carregar sem compactação** (em inglês: *Load unpacked*).
4. Selecione a **pasta que você extraiu** no Passo 1.

### ⚠️ O jeito certo de escolher a pasta

Na janela que abrir, deixe a pasta **selecionada** e clique em "Selecionar
pasta". Se você **entrar** na pasta e ela aparecer vazia na barra, o navegador
recebe o lugar errado e reclama que o *manifest* está faltando.

> O aviso amarelo de "extensão em modo desenvolvedor" é **normal** para
> extensões instaladas fora da loja. Pode ignorar — não desative a extensão.

---

## Passo 3 — Deixar o ícone à mão

1. Clique no ícone de **peça de quebra-cabeça** 🧩 na barra do navegador.
2. Ache **NexGestor** na lista e clique no **alfinete** 📌 ao lado.

O ícone do NexGestor passa a ficar fixo na barra.

---

## Passo 4 — Usar

1. Clique no **ícone do NexGestor**. O painel abre na lateral direita.
2. Clique em **"Nova campanha"**.
3. Preencha os dados e clique em **"Analisar campanha"**.

Pronto — o diagnóstico aparece com score de saúde, causa raiz e as ações
recomendadas.

### As três formas de inserir uma campanha

| Modo | Como funciona | Recomendação |
|---|---|---|
| **Manual** | Você digita as métricas no formulário | ✅ **Use este.** É o mais confiável |
| **Importar arquivo** | Você anexa um `.json` com as métricas | ✅ Bom para testar vários casos rápido |
| **Coletar automático** | Tenta ler a tabela do Gerenciador de Anúncios | ⚠️ Experimental — veja abaixo |

---

## Nas próximas vezes

Basta clicar no ícone do NexGestor. Só isso — não há nada para ligar antes.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| **"Manifest file is missing or unreadable"** | Pasta errada na hora de carregar. Repita o Passo 2 selecionando a pasta **sem entrar nela**. |
| **"Não foi possível falar com o servidor"** | Espere um minuto e tente de novo: várias pessoas analisando ao mesmo tempo esbarram no limite do servidor (o escritório inteiro conta como um só usuário). Se insistir, confira sua internet e avise o time. |
| **"O servidor está recebendo muitas análises agora"** | É o limite acima, dito com todas as letras. Um minuto de espera resolve — seus dados continuam preenchidos. |
| **"O servidor está fora do ar"** | Não é problema seu nem dos seus dados. Avise o time; quem cuida do servidor precisa religá-lo. |
| **"Você está sem conexão com a internet"** | Reconecte e tente de novo — o formulário não se perde. |
| **O painel não abre ao clicar no ícone** | Recarregue a extensão em `chrome://extensions` (ícone ↻ no card do NexGestor) e tente de novo. |
| **A extensão sumiu do navegador** | Provavelmente a pasta extraída foi movida ou apagada. Extraia o zip de novo e repita o Passo 2. |
| **A análise demora muito** | Alguns segundos é normal (o sistema consulta a IA). Se travar ou der erro, avise o time. |

---

## O que esperar (e o que não esperar)

Coisas que valem saber antes de avaliar a ferramenta:

- **Seus dados ficam só no seu navegador.** Não há conta nem servidor guardando
  suas campanhas. Se você limpar os dados de navegação, elas somem. Também não há
  sincronização entre computadores — cada pessoa vê só as próprias campanhas.
- **A "coleta automática" é experimental.** Ela tenta ler a tabela do Gerenciador
  de Anúncios da Meta, mas nunca foi validada numa conta real e pode falhar ou
  trazer dados errados. **Para avaliar a ferramenta, use o modo manual.** Ela
  será substituída pela API oficial da Meta antes do lançamento.
- **As duas campanhas marcadas como "exemplo"** na tela inicial são demonstração,
  não dados reais. As suas aparecem sem essa marcação.

---

## Quando sair uma versão nova

Você recebe um `.zip` novo. Extraia por cima (substituindo a pasta antiga), vá
em `chrome://extensions` e clique no ícone de **recarregar** ↻ no card do
NexGestor. Só isso.

---

## Dúvidas

Qualquer coisa que travar, mande para o time:

1. Em que passo você estava.
2. Print da tela.
3. A mensagem de erro completa, se houver.
