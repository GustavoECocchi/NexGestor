# Deploy do backend NexGestor no VPS (Hostinger)

Guia para **você** (Gustavo) subir o backend uma vez no VPS. Depois disso, sua
equipe só instala a extensão — ninguém mais precisa mexer em Python ou servidor.

O resultado final é uma URL HTTPS fixa (ex.: `https://api.seudominio.com.br`)
que a extensão de todo mundo vai usar.

> **Tempo estimado:** ~30 min na primeira vez.
> **Pré-requisito:** acesso ao seu VPS Hostinger (IP + senha root, ou o
> terminal do navegador no hPanel).

---

## ⚠️ Passo -1 — Enviar estes arquivos pro GitHub (obrigatório antes de tudo)

O VPS vai **baixar o código do GitHub**. Se esta pasta `deploy/` ainda não
estiver lá, o Passo 3 traz um repositório sem ela e o deploy trava.

Do seu computador, na pasta do projeto:
```bash
git status                 # confira o que vai entrar antes de adicionar
git add -A
git commit -m "Infra de deploy: Docker, Caddy e guia da equipe"
git push origin main
```

Confirme que subiu abrindo o repositório no GitHub e vendo a pasta `deploy/`.

> Se o VPS for clonar o repositório **da empresa** (`NexGoldCompany/NexGestor`),
> rode também `git push empresa main` — senão os arquivos não estarão lá.

---

## Passo 0 — Definir o domínio (endereço do backend)

O HTTPS precisa de um nome de domínio apontando pro IP do VPS. Dois caminhos:

- **Tem um domínio?** (ex.: `nexgestor.com.br`) → crie um **subdomínio**
  `api.` pra ele. É o recomendado.
- **Não tem domínio?** → dá pra usar `<IP-DO-VPS>.nip.io` (um serviço grátis
  que transforma o IP num nome válido). Ex.: se o IP é `72.60.1.23`, o domínio
  vira `72.60.1.23.nip.io`. Funciona com HTTPS de verdade, sem comprar nada.

Guarde o domínio escolhido — vou chamar de `SEU_DOMINIO` daqui pra frente.

### Se tiver domínio: apontar o DNS

No painel onde seu domínio é gerenciado (Hostinger hPanel → Domínios → DNS),
crie um registro:

| Tipo | Nome  | Aponta para (Valor) | TTL     |
|------|-------|---------------------|---------|
| A    | `api` | `IP_DO_SEU_VPS`     | 300/Auto|

Espere alguns minutos propagar. Teste no seu PC:
```bash
ping api.seudominio.com.br     # tem que responder com o IP do VPS
```
(Com `nip.io` não precisa criar nada — já resolve sozinho.)

---

## Passo 1 — Entrar no VPS

Pelo terminal do seu PC:
```bash
ssh root@IP_DO_SEU_VPS
```
(ou use o **Terminal do navegador** no hPanel da Hostinger → seu VPS → Terminal.)

---

## Passo 2 — Instalar Docker (uma vez só)

Cole isto no VPS. Instala Docker + o plugin do Compose:
```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version    # confirma que instalou
```

---

## Passo 3 — Baixar o código no VPS

O repositório é **privado**, então o VPS precisa de permissão pra baixar. O
jeito limpo é uma **chave de deploy** (não expõe senha nenhuma):

```bash
# 1) Gera uma chave SSH no VPS (dê Enter em tudo, sem senha):
ssh-keygen -t ed25519 -C "vps-nexgestor" -f ~/.ssh/id_ed25519 -N ""

# 2) Mostra a chave PÚBLICA (pode aparecer no chat sem problema — é pública):
cat ~/.ssh/id_ed25519.pub
```
Copie o que apareceu e cole no GitHub em:
**repositório → Settings → Deploy keys → Add deploy key** (só leitura basta).

Depois, ainda no VPS:
```bash
git clone git@github.com:NexGoldCompany/NexGestor.git
cd NexGestor/deploy
```

> **Atalho sem chave (menos elegante):** se preferir, dá pra baixar via HTTPS
> com um token do GitHub. Mas isso deixa o token no histórico do VPS — a chave
> de deploy acima é mais segura.

---

## Passo 4 — Configurar (domínio + chave do Gemini)

```bash
cp .env.example .env
nano .env
```

No editor, ajuste:
- `DOMAIN=` → coloque o `SEU_DOMINIO` do Passo 0.
- `GEMINI_API_KEY=` → **cole a chave do Gemini aqui**, no editor do VPS.

> 🔒 **Importante:** a chave é colada **aqui, no `nano` do VPS** — nunca no
> chat do Claude. Este arquivo `.env` fica só no servidor e não vai pro GitHub.

Salve no `nano`: `Ctrl+O`, `Enter`, depois `Ctrl+X`.

---

## Passo 5 — Subir tudo

```bash
docker compose up -d --build
```

Primeira vez demora alguns minutos (baixa imagens, instala dependências, o
Caddy emite o certificado HTTPS). Acompanhe:
```bash
docker compose logs -f
```
Quando aparecer `certificate obtained successfully` e o backend logando, está
no ar. Saia dos logs com `Ctrl+C` (não derruba nada — segue rodando).

---

## Passo 6 — Testar

Do seu PC (ou navegador):
```bash
curl https://SEU_DOMINIO/api/v1/campaign/scenarios
```
Tem que voltar um JSON com os cenários. Se voltar, **o backend está pronto** e
essa é a URL que vai na extensão da equipe.

Abra também `https://SEU_DOMINIO/docs` no navegador — é a documentação
interativa da API (útil pra confirmar visualmente).

---

## Passo 7 — Firewall (se o Passo 6 falhar)

Se a Hostinger tiver firewall no VPS, libere as portas **80** e **443**
(hPanel → VPS → Firewall). Sem elas o HTTPS não conecta.

---

## Passo 8 — Gerar o pacote da equipe (no seu computador, não no VPS)

Com o backend no ar, gere a extensão já apontando pra ele. Na pasta do projeto,
no **seu computador**:

```bash
frontend/nexgestor-extension/build-team.sh https://SEU_DOMINIO
```

Isso produz:
- `frontend/nexgestor-extension/nexgestor-extensao-<data>.zip` → **envie esse
  arquivo pra equipe**, junto com o guia `COMO-USAR.md`.
- a pasta `extensao-pronta/` atualizada (pra quem preferir pegar do repositório).

> A URL precisa ser **https://**. O script recusa `http://` remoto de propósito:
> o Chrome bloqueia essas chamadas e a extensão falharia sem mensagem clara.

Se você mexer no frontend depois, rode o script de novo e redistribua o zip.

---

## Manutenção do dia a dia

| Ação                         | Comando (dentro de `NexGestor/deploy`)     |
|------------------------------|--------------------------------------------|
| Ver logs                     | `docker compose logs -f`                   |
| Reiniciar                    | `docker compose restart`                   |
| Atualizar após mudança no código | `git pull && docker compose up -d --build` |
| Parar tudo                   | `docker compose down`                      |
| Trocar a chave do Gemini     | `nano .env` → `docker compose up -d`       |

O `restart: unless-stopped` faz o backend voltar sozinho se o VPS reiniciar.

---

## Resumo do que a equipe precisa saber

**Nada.** Depois deste deploy, o backend fica no ar sozinho. A equipe só instala
a extensão (ver `COMO-USAR.md`, na raiz do projeto) — que já vem
apontando pra `https://SEU_DOMINIO`.
