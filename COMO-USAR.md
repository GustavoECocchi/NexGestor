# Como usar o NexGestor

Guia para quem vai **usar** a ferramenta. Não precisa saber programar, não
precisa mexer em nada do código.

- **Primeira vez:** cerca de 10 minutos (a maior parte é esperar instalação).
- **Próximas vezes:** cerca de 30 segundos.

---

## Antes de começar: o que instalar

São duas coisas — e provavelmente você já tem a segunda.

### 1. Python (obrigatório)

É o que faz o motor de análise rodar na sua máquina.

1. Acesse **<https://www.python.org/downloads/>**
2. Clique no botão amarelo **"Download Python 3.x.x"**.
3. Abra o arquivo baixado.
4. ⚠️ **NA PRIMEIRA TELA, ANTES DE CLICAR EM QUALQUER COISA:** marque a caixinha
   embaixo escrita **"Add python.exe to PATH"**.

   > Essa caixinha é o erro nº 1 de quem instala Python. Se você não marcar, o
   > NexGestor vai dizer que "Python não foi encontrado" mesmo com ele
   > instalado. Se isso acontecer, é só rodar o instalador de novo e marcar.

5. Clique em **"Install Now"** e espere.
6. Ao terminar, clique em **"Close"**.

### 2. Um navegador Chrome, Brave ou Edge

Qualquer um dos três serve. Se você já usa um deles, não precisa instalar nada.

> **Não é preciso instalar Node.js, npm ou nada de programação.** A extensão já
> vem pronta dentro do projeto.

---

## Baixando o projeto

1. Acesse o repositório: **<https://github.com/NexGoldCompany/NexGestor>**
2. Clique no botão verde **"Code"** e depois em **"Download ZIP"**.
3. Vá até a pasta **Downloads**, clique com o botão direito no arquivo baixado e
   escolha **"Extrair tudo…"** → **"Extrair"**.

Você vai terminar com uma pasta chamada `NexGestor-main`.

> **Atenção:** ao abrir essa pasta, é comum encontrar **outra pasta
> `NexGestor-main` dentro dela**. A pasta certa é a que contém os arquivos
> `iniciar-backend.bat`, `README.md` e a pasta `extensao-pronta`. Se você abriu
> uma pasta e só viu outra pasta dentro, entre nela.

---

## Passo 1 — Ligar o motor de análise

Na pasta do projeto, **dê um duplo clique no arquivo `iniciar-backend.bat`**.

Vai abrir uma janela preta com letras. Isso é normal — é o motor rodando.

**Na primeira vez** ela demora alguns minutos (está baixando o que precisa).
Você vai ver mensagens como "Criando ambiente virtual" e "Conferindo
dependencias". **Espere.**

Quando aparecer esta mensagem, está pronto:

```
==========================================
   Backend no ar: http://localhost:8000

   DEIXE ESTA JANELA ABERTA enquanto usar
   a extensao. Para parar: Ctrl+C.
==========================================
```

### ⚠️ Deixe essa janela preta aberta

Ela precisa ficar aberta o tempo todo enquanto você usa o NexGestor. Se você
fechar, a ferramenta para de analisar. Pode minimizar tranquilamente — só não
feche.

### Se aparecer algum aviso do Windows

- **"O Windows protegeu o computador"** (tela azul do SmartScreen): clique em
  **"Mais informações"** e depois em **"Executar assim mesmo"**.
- **Alerta do Firewall do Windows**: clique em **"Permitir acesso"**. Pode
  deixar marcado só "Redes privadas".

Os dois avisos são normais para um programa que roda localmente e ainda não tem
assinatura digital. Nada sai da sua máquina.

---

## Passo 2 — Instalar a extensão no navegador

Isso é feito **uma única vez**. Depois ela fica instalada para sempre.

1. Abra o navegador e digite na barra de endereço: **`chrome://extensions`**
   (no Brave é `brave://extensions`, no Edge é `edge://extensions`).
2. No canto **superior direito**, ligue a chavinha **"Modo do desenvolvedor"**.
3. Vão aparecer botões novos. Clique em **"Carregar sem compactação"**.
4. Navegue até a pasta do projeto e selecione a pasta **`extensao-pronta`**.

### ⚠️ O jeito certo de escolher a pasta

Este é o erro nº 2 mais comum. Ao abrir a janela de seleção:

- Clique **uma vez** na pasta `extensao-pronta` para deixá-la **destacada em
  azul** — **não dê duplo clique**, não entre dentro dela.
- Só então clique no botão **"Selecionar pasta"**.

> Se você entrar dentro da pasta e clicar "Selecionar pasta", o navegador
> recebe a pasta errada e reclama: *"Manifest file is missing or unreadable"*.
> Se der esse erro, é só repetir escolhendo a pasta como descrito acima.

Deu certo? Vai aparecer um cartão escrito **NexGestor** na lista de extensões.

---

## Passo 3 — Deixar o ícone à mão

1. Clique no ícone de **peça de quebra-cabeça** 🧩 na barra do navegador (ao lado
   da barra de endereço).
2. Ache **NexGestor** na lista e clique no **alfinete** 📌 ao lado.

O ícone do NexGestor passa a ficar fixo na barra.

---

## Passo 4 — Usar

1. Clique no **ícone do NexGestor** na barra do navegador. O painel abre na
   lateral direita.
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

Muito mais simples:

1. Duplo clique em **`iniciar-backend.bat`** e espere a mensagem de "Backend no ar".
2. Clique no ícone do NexGestor.

Só isso. A extensão continua instalada, e o Python não precisa ser instalado de
novo.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| **"Python nao encontrado"** na janela preta | Você não marcou "Add python.exe to PATH". Rode o instalador do Python de novo e marque a caixinha. |
| **"Manifest file is missing or unreadable"** | Pasta errada na hora de carregar. Repita o Passo 2 selecionando a `extensao-pronta` sem entrar nela. |
| **"Não foi possível falar com o backend"** dentro da extensão | A janela preta foi fechada ou ainda não terminou de subir. Abra o `iniciar-backend.bat` e espere a mensagem "Backend no ar". |
| **A janela preta abre e some na hora** | Provavelmente Python não está instalado. Instale conforme o início deste guia. |
| **O painel não abre ao clicar no ícone** | Recarregue a extensão em `chrome://extensions` (ícone de setinha circular ↻) e tente de novo. |
| **A janela preta mostra erro em vermelho** | Copie a mensagem inteira e mande para o time. |

---

## O que esperar (e o que não esperar)

Coisas que valem saber antes de avaliar a ferramenta:

- **A camada de IA está desligada** nesta rodada de testes. Isso **não** limita a
  análise: o motor de regras entrega o diagnóstico completo — score, causa raiz,
  cenários e ações. O que não aparece é o resumo escrito por IA.
- **Seus dados ficam só no seu navegador.** Não há conta nem servidor guardando
  nada. Se você limpar os dados de navegação, as campanhas somem. Também não há
  sincronização entre computadores — cada pessoa vê só as próprias campanhas.
- **A "coleta automática" é experimental.** Ela tenta ler a tabela do Gerenciador
  de Anúncios da Meta, mas nunca foi validada numa conta real e pode falhar ou
  trazer dados errados. **Para avaliar a ferramenta, use o modo manual.** Ela
  será substituída pela API oficial da Meta antes do lançamento.
- **As duas campanhas marcadas como "exemplo"** na tela inicial são demonstração,
  não dados reais. As suas aparecem sem essa marcação.

---

## Dúvidas

Qualquer coisa que travar, mande para o time:

1. Em que passo você estava.
2. Print da tela ou da janela preta.
3. A mensagem de erro completa, se houver.
