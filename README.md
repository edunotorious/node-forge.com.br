# Node-Forge

IDE visual em nuvem para computação quântica com Qiskit. O usuário arrasta blocos
no canvas (Hadamard, CNOT, Measure, …), conecta, e clica em ▶ — o backend gera o
script Python equivalente e executa em um sandbox isolado, retornando counts,
stdout/stderr e histogramas em tempo quase real.

O alvo é tornar Qiskit acessível para quem está aprendendo computação quântica
sem precisar escrever Python desde o primeiro dia. Cada nodo do canvas representa
uma operação (gate, medição, simulação, plot) e edges definem a ordem de
execução. Além do canvas, há também:

- Painel **Details** com Variables / Functions tipadas (Int/Float/Str/Bool/List/Dict)
- Aba **Classes** com decorators, herança, vars e métodos editáveis
- **Terminal** que é um REPL Python real rodando no sandbox, com as definições do arquivo já carregadas
- **Console** mostrando stdout + histogramas PNG inline depois de cada run
- **Imports** com catálogo de pacotes Python e nodos disponíveis
- **Node Vault**, marketplace onde a comunidade publica circuitos — grátis para clonar ou pagos (prévia)

Em produção em **[node-forge.com.br](https://node-forge.com.br)**, com deploy
automático a cada push na `main` (ver [Deploy em produção](#deploy-em-produção)).

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Node Vault (marketplace)](#node-vault-marketplace)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Envio de email](#envio-de-email-recuperação-de-senha)
- [Primeiro Hello World](#primeiro-hello-world)
- [Comandos úteis](#comandos-úteis)
- [Testes](#testes)
- [CI/CD](#cicd)
- [Deploy em produção](#deploy-em-produção)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Trabalhando em equipe](#trabalhando-em-equipe)
- [Aviso sobre o executor](#aviso-sobre-o-executor)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Funcionalidades

- **Editor visual**: drag-and-drop de gates quânticos no canvas (React Flow), edição de propriedades por nodo, undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`) — arrastar um nodo vira um único passo de undo, e excluir um nodo remove também as conexões dele
- **Autosave confiável**: salvamentos em fila (uma edição feita durante um save não se perde), save ao sair do editor e ao fechar a aba
- **Múltiplos arquivos por projeto**: cada projeto pode ter vários circuitos (`Arquivo 1`, `Arquivo 2`, …)
- **Codegen automático**: grafo → script Python Qiskit válido
- **Execução sandboxed**: cada `▶` sobe um container Docker efêmero (256 MB, 1 CPU, sem rede, timeout 30s, user `nobody`, capabilities removidas), com limite de execuções simultâneas no executor e suporte opcional a gVisor
- **REPL Python integrado**: aba Terminal roda Python real no sandbox; variáveis, funções e classes definidas no arquivo já vêm carregadas
- **Node Vault**: publique projetos grátis ou pagos, busque por categoria/preço, clone, curta e comente — [detalhes abaixo](#node-vault-marketplace)
- **Multi-tenant auth**: register/login com JWT em cookie httpOnly, mudar email/senha/username, recuperação de senha com email via Resend
- **Rate limiting**: por IP nas rotas de auth e por usuário nas execuções (20 runs/min) e no Terminal (60 comandos/min)
- **Profile completo**: avatar upload (PNG/JPEG/WebP/GIF, até 2 MB), Vault profile (nome, bio, site, redes sociais, país), edição inline
- **Projects**: grid de cards, duplicar projeto (clona arquivos), upload de thumbnail, rename, delete, context menu por click direito
- **i18n**: UI completamente bilíngue (PT-BR + EN) via next-intl, language switcher no header
- **Async runs**: polling do `GET /jobs/:id` para circuitos longos não travarem a conexão
- **Testes automatizados**: pytest no backend, Vitest no frontend e Playwright E2E ponta a ponta (ver [Testes](#testes))
- **Segurança**: CSP, HSTS, X-Frame-Options, Referrer-Policy e Permissions-Policy em todas as respostas; proxy BFF que valida o caminho e a origem antes de repassar ao backend; redirect pós-login restrito a caminhos internos

---

## Node Vault (marketplace)

Vitrine pública em `/vault` (não exige login para navegar) onde os usuários
publicam cópias dos seus projetos.

- **Publicação** pelo editor (**Publicar no Vault**): título, descrição, até 5 tags e preço
- **Grátis ou pago**: o autor escolhe; projetos pagos custam entre R$ 1,00 e R$ 10.000,00 e o preço pode ser alterado depois na página do projeto
- **Vitrine**: busca, categorias pelas tags mais usadas, filtro Todos / Grátis / Pagos, ordenação (recentes, populares, mais curtidas, menor e maior preço), destaques, paginação "Carregar mais" e filtros refletidos na URL
- **Cards** com capa gerada a partir do próprio circuito (quantidade de qubits e nodos), selo de preço, autor e contadores de clones, curtidas e comentários
- **Snapshot**: a listagem guarda uma cópia dos arquivos no momento da publicação; o autor continua editando o original e usa **Republicar** para atualizar
- **Clonar** cria um projeto novo na conta de quem clonou; curtidas e comentários exigem login

**Projetos pagos — estado atual:** ainda não há checkout. Para quem não é o
autor, a página mostra só uma prévia (qubits, shots, quantidade de nodos e
arquivos), o botão **Comprar · em breve** fica desabilitado e a API não entrega
o grafo nem permite clonar (`402 Payment Required`). O banco guarda o preço em
centavos (`price_cents`) e a moeda (`currency`, hoje `BRL`), sem amarrar a um
gateway — a integração de pagamento fica para uma próxima etapa.

Principais rotas (`/api/vault/...` pelo proxy do Next):

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/vault?q=&tag=&price=all\|free\|paid&sort=recent\|popular\|liked\|price_asc\|price_desc&limit=&offset=` | Lista pública |
| `GET` | `/vault/tags` | Tags mais usadas, com contagem |
| `GET` | `/vault/{slug}` | Detalhe (com `locked: true` e grafo reduzido para projetos pagos de terceiros) |
| `POST` | `/vault` | Publica um projeto |
| `PATCH` | `/vault/{id}` | Edita título, descrição, tags e preço (só o autor) |
| `POST` | `/vault/{id}/republish` | Atualiza o snapshot a partir do projeto original |
| `DELETE` | `/vault/{id}` | Despublica |
| `POST` | `/vault/{id}/clone` | Clona para os projetos do usuário (`402` se pago) |
| `POST` / `DELETE` | `/vault/{id}/like` | Curtir / descurtir |
| `GET` / `POST` / `DELETE` | `/vault/{id}/comments[/{comment_id}]` | Comentários |

---

## Arquitetura

```
                           ┌────────────────────────┐
                           │  Browser do usuário    │
                           └─────────────┬──────────┘
                                         │ HTTPS
                                         ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  caddy (só em produção, :80/:443)                            │
   │  - TLS automático (Let's Encrypt), www → apex                │
   └─────────────┬────────────────────────────────────────────────┘
                 ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  frontend (Next.js 16, port 3000)                            │
   │  - App Router + Server Components                            │
   │  - BFF proxy em /api/* → backend                             │
   │  - cookie httpOnly fica first-party (sem CORS)               │
   └─────────────┬────────────────────────────────────────────────┘
                 │ /api/* server-side                              ┐
                 ▼                                                 │
   ┌──────────────────────────────────────────┐    ┌──────────────▼──────────────┐
   │  backend (FastAPI, port 8000)            │    │  postgres                   │
   │  - auth + projects + users + runner      │◄──►│  - users, projects,         │
   │  - vault (marketplace)                   │    │    project_files, jobs,     │
   │  - codegen (graph → Python)              │    │    password_reset_tokens,   │
   │  - rate limit (slowapi)                  │    │    vault_* (listings, tags, │
   │  - email (Resend backend)                │    │    likes, comments)         │
   └─────────────┬────────────────────────────┘    └─────────────────────────────┘
                 │ POST /run (token-auth)
                 ▼
   ┌──────────────────────────────────────────┐
   │  executor (FastAPI + docker SDK, :8001)  │
   │  - exposto SÓ na executor-net interna    │     ┌──────────────────────────┐
   │  - spawna container efêmero por /run     │────►│  runner ephemeral        │
   │  - até MAX_CONCURRENT_RUNS ao mesmo tempo│     │  python -u script.py     │
   │  - mem 256m, 1 CPU, network_disabled,    │     │  (mesma imagem executor) │
   │    user=nobody, cap_drop=ALL, pids=100   │     │  removido após exit      │
   │  - timeout 30s, runtime runc ou gVisor   │     └──────────────────────────┘
   └──────────────────────────────────────────┘
```

Serviços orquestrados via Docker Compose (`docker-compose.yml` em dev, mais o
overlay `docker-compose.prod.yml` em produção, que adiciona o Caddy). O
**frontend** é a única origem que o browser acessa. O **backend** roda em rede
interna e é alcançado via o BFF do Next (que mantém o cookie httpOnly
first-party). O **executor** spawna containers efêmeros via `docker.sock`
montado do host (root-equivalent — ver [aviso](#aviso-sobre-o-executor)). O
**postgres** persiste tudo num volume Docker e, em produção, não publica porta
para fora.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · @xyflow/react (React Flow) · next-intl · TanStack Query · Zustand · react-hook-form + zod |
| Backend | FastAPI · SQLAlchemy 2 async · asyncpg · Alembic · uv · pyjwt · bcrypt · slowapi · httpx |
| Executor | FastAPI · Docker SDK · Qiskit · qiskit-aer · matplotlib · numpy |
| DB | Postgres 16 |
| Testes | pytest · Vitest · Playwright |
| Infra | Docker Compose · Caddy · GitHub Actions · VM na Oracle Cloud |
| Email | Resend (transacional) |

---

## Pré-requisitos

A única coisa **obrigatória** é Docker. Node e Python só são necessários se
você quiser desenvolver fora do container (rodar testes, gerar `uv.lock`, etc.).

### Windows

1. [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) com backend WSL 2 (instalador ativa por padrão)
2. [WSL 2](https://learn.microsoft.com/windows/wsl/install) (`wsl --install` no PowerShell)
3. [Git for Windows](https://git-scm.com/download/win)

Recomendado: clonar o projeto **dentro** do WSL (ex: `~/projects/node-forge`)
em vez de em `C:\…`. A performance do bind mount entre Windows e WSL é bem
melhor lá dentro.

### macOS

1. [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/) (Intel ou Apple Silicon — ambos suportados)
2. Git já vem instalado; senão `xcode-select --install`

### Linux

1. [Docker Engine](https://docs.docker.com/engine/install/) + plugin `docker compose` (não a versão velha em Python)
2. Adiciona seu usuário ao grupo `docker` pra não precisar de `sudo`:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```
3. Git via package manager

### Opcionais (para dev fora do container)

- **Node 20+ e pnpm 10.33** — só se quiser rodar `pnpm install` / `pnpm lint` / testes no host. Use a versão do projeto (`corepack enable` ou `npx pnpm@10.33.0`); o pnpm 11 altera o `pnpm-workspace.yaml`
- **Python 3.12+ e [uv](https://docs.astral.sh/uv/)** — só se quiser regenerar `uv.lock`, rodar `alembic` ou o pytest no host

---

## Rodando localmente

### 1. Clone

```bash
git clone https://github.com/edunotorious/node-forge.com.br.git node-forge
cd node-forge
```

### 2. Crie seu `.env`

```bash
cp .env.example .env
```

Abre `.env` e ajusta os campos sensíveis — veja a [tabela de variáveis](#variáveis-de-ambiente).
**Pelo menos altere `JWT_SECRET` e `INTERNAL_API_TOKEN`** com valores únicos.
Para gerar uma string aleatória:

```bash
# Linux / macOS / WSL
openssl rand -hex 32

# Windows PowerShell
[System.Convert]::ToBase64String((1..32 | %{Get-Random -Maximum 256}))
```

### 3. Build + start

```bash
docker compose up -d --build
```

O primeiro build leva ~3-5 minutos (qiskit + matplotlib pesam). Vai puxar
Postgres 16, build do backend (FastAPI), frontend (Next.js + node_modules), e
executor (qiskit + qiskit-aer + matplotlib).

### 4. Migrações

Em dev, o backend aplica `alembic upgrade head` sozinho toda vez que o
container sobe. Para rodar manualmente (por exemplo, depois de criar uma
migração nova):

```bash
docker compose exec backend uv run alembic upgrade head
```

### 5. Acessa

| Serviço | URL | Observação |
|---|---|---|
| frontend | http://localhost:3000 | **Única** origem que o browser deve usar |
| backend | http://localhost:8000 | Acesso direto só pra debug com curl; a UI usa o proxy do Next |
| executor | :8001 (interno) | Não exposto ao host por design |
| postgres | localhost:5432 | Credenciais no `.env` |

Crie uma conta em `/register` e parta pro primeiro Hello World.

> Se a porta 5432 já estiver ocupada por outro Postgres na sua máquina, crie um
> `docker-compose.override.yml` (fora do versionamento) com
> `services: { postgres: { ports: !reset [] } }`.

---

## Variáveis de ambiente

Tudo vem do arquivo `.env` na raiz do repositório, carregado automaticamente
pelo Docker Compose via `env_file: .env`.

> ⚠️ **`.env` está em `.gitignore`** e nunca deve ser commitado. Use o
> `.env.example` (que está versionado) como template. Cada dev mantém o seu
> próprio `.env` local; segredos compartilhados (chaves de API de produção,
> tokens reais) ficam num gerenciador de segredos do time (1Password, Vault,
> AWS Secrets Manager, …), não num arquivo de texto.

### Tabela completa

| Variável | Para que serve | Default | Você precisa mudar? |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais e nome do banco do Postgres | `postgres` / `postgres` / `nodeforge` | Não em dev. **Em produção, sim** |
| `DATABASE_URL` | URL de conexão do backend ao Postgres | `postgresql+asyncpg://postgres:postgres@postgres:5432/nodeforge` | Não em dev |
| `JWT_SECRET` | Chave HMAC pra assinar tokens JWT do cookie de auth | placeholder | **Sim, sempre.** Gere uma única por ambiente |
| `JWT_ALGORITHM` | Algoritmo de assinatura | `HS256` | Não |
| `JWT_EXPIRE_DAYS` | Duração do cookie de sessão | `7` | A gosto |
| `EXECUTOR_URL` | URL interna do serviço executor | `http://executor:8001` | Não |
| `EXECUTOR_TIMEOUT_SECONDS` | Limite máx de execução de um run | `30` | A gosto |
| `CORS_ORIGINS` | Origens permitidas no backend (o browser só fala com o proxy do Next) | `http://localhost:3000` | Fixado no `docker-compose.prod.yml` em produção |
| `COOKIE_SECURE` | Flag `Secure` do cookie httpOnly | `true` | Só `false` se for testar a API com curl em HTTP; fixado em `true` na produção |
| `INTERNAL_API_TOKEN` | Segredo compartilhado entre Next BFF e FastAPI (defense-in-depth) | placeholder | **Sim, sempre.** Único por ambiente |
| `EMAIL_BACKEND` | Backend de envio de email | `stdout` (printa link no log) | Troca pra `resend` em prod |
| `EMAIL_FROM` | Remetente dos emails | `Node-Forge <onboarding@resend.dev>` | Troca pelo seu domínio verificado |
| `RESEND_API_KEY` | API key da Resend | vazio | Sim, se `EMAIL_BACKEND=resend` |
| `APP_BASE_URL` | URL pública usada nos links dos emails | `http://localhost:3000` | Fixado em `https://node-forge.com.br` no `docker-compose.prod.yml` |
| `BACKEND_INTERNAL_URL` | URL que o Next usa server-side pro backend | `http://backend:8000` | Não |
| `NEXT_PUBLIC_API_URL` | URL placeholder pra curl no host | `http://localhost:8000` | Não |
| `NEXT_TELEMETRY_DISABLED` | Desliga telemetria anônima do Next | `1` | Não |
| `RUNNER_RUNTIME` | Runtime dos containers de execução: `runc` ou `runsc` (gVisor) | `runc` | Recomendado `runsc` em produção (ver [infra/gvisor-setup.md](infra/gvisor-setup.md)) |
| `MAX_CONCURRENT_RUNS` | Quantos containers de execução podem existir ao mesmo tempo | `2` | Dimensione pela memória/CPU do host |
| `RUN_SLOT_WAIT_SECONDS` | Quanto um run espera por vaga antes de falhar com "Executor is busy" | `5` | A gosto |

### Padrões "que precisam mudar" vs "que pode deixar"

Pra rodar em **dev local**, depois de `cp .env.example .env` o mínimo que você
precisa editar é:

```bash
JWT_SECRET=<gere-uma-string-aleatoria>
INTERNAL_API_TOKEN=<gere-outra-string-aleatoria>
```

Pra **enviar emails reais** (recuperação de senha funcionar), adicione também:

```bash
EMAIL_BACKEND=resend
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM="Node-Forge <no-reply@seudominio.com.br>"
```

Pra **produção** mude tudo o que diz "Sim" na coluna da tabela. `APP_BASE_URL`,
`COOKIE_SECURE` e `CORS_ORIGINS` já vêm fixados pelo `docker-compose.prod.yml`,
então um `.env` desatualizado no servidor não consegue, por exemplo, mandar
links de recuperação de senha apontando para `localhost`.

> 💡 **Truque útil:** depois de editar `.env`, sempre use `docker compose up -d backend`
> (recria o container) — **não** `docker compose restart`, que reusa o container
> existente com o `env_file` velho. Esse é um gotcha clássico do compose.

---

## Envio de email (recuperação de senha)

Por padrão o backend roda com `EMAIL_BACKEND=stdout` — o link de recuperação
aparece em `docker compose logs backend` em vez de ir pra um email real. Útil
em dev e testes locais, não precisa nem criar conta na Resend.

Para ativar envio real via [Resend](https://resend.com) (free tier: 100/dia, 3000/mês):

1. Crie conta em [resend.com](https://resend.com)
2. Em **API Keys** → gere uma key (formato `re_xxxxxxxxxx`)
3. (Opcional, mas necessário pra mandar pra qualquer email) Em **Domains** → adicione `seudominio.com.br`, configure os registros DNS (SPF, DKIM) que eles vão exibir, e clica em "Verify"
4. No `.env`:
   ```bash
   EMAIL_BACKEND=resend
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM="Node-Forge <no-reply@seudominio.com.br>"
   ```
5. `docker compose up -d backend` (recria — não use `restart`)

Se o backend estiver enviando pela Resend com um link que aponta para
`localhost`, ele registra um erro alto no log no primeiro envio — sinal de que
`APP_BASE_URL` está errado.

> **Gotcha do free tier:** se você usar `EMAIL_FROM="…<onboarding@resend.dev>"`
> (o sender de teste deles), só consegue enviar pro email da própria conta
> Resend. Pra mandar pra qualquer destinatário, precisa do domínio verificado.

---

## Primeiro Hello World

Depois de subir a stack, crie uma conta e siga estes passos pra rodar o
**Bell state Φ⁺** — o Hello World canônico da computação quântica:

1. Em `/projects`, clique no tile laranja `+` e crie um projeto chamado `Hello World`
2. No editor, vai pro painel `Inspect` e configura `Qubits = 2`, `Bits clássicos = 2`, `Shots padrão = 1000`
3. Da paleta `Details` arrasta na ordem:
   - **Hadamard (H)** — `qubit_index = 0`
   - **CNOT** — `control_qubit = 0`, `target_qubit = 1`
   - **Measure** — `qubit_index = 0`, `classical_index = 0`
   - **Measure** — `qubit_index = 1`, `classical_index = 1`
   - **Run (Aer Simulator)** — `shots = 1000`
   - **Plot Histogram**
4. Conecte na ordem: H → CNOT → Measure → Measure → Run → Plot
5. Click no ▶ verde no canto superior direito do canvas

Resultado esperado em ~3 segundos no Console: `Counts: {'00': ~500, '11': ~500}`
e um histograma com duas barras. **Nunca** vai aparecer `01` ou `10` — isso é
emaranhamento quântico operando.

Quer compartilhar? Clique em **Publicar no Vault** no topo do editor.

---

## Comandos úteis

```bash
# Logs em tempo real
docker compose logs -f backend
docker compose logs -f executor
docker compose logs -f frontend

# Status dos serviços
docker compose ps

# Parar tudo (mantém dados do postgres no volume)
docker compose down

# Parar e apagar volumes (zera o banco)
docker compose down -v

# Rebuild (após mudança em Dockerfile, package.json ou pyproject.toml)
docker compose up -d --build

# Rebuild de um serviço só
docker compose up -d --build backend

# Shell dentro do backend
docker compose exec backend bash

# Rodar as migrations
docker compose exec backend uv run alembic upgrade head

# Criar uma nova migration
docker compose exec backend uv run alembic revision -m "descricao"

# Type-check, lint e testes unitários do frontend
docker compose exec frontend pnpm typecheck
docker compose exec frontend pnpm lint
docker compose exec frontend pnpm test

# Lint backend
uv run --project backend ruff check backend/src/
```

---

## Testes

Três camadas, cada uma cobrindo um risco diferente. Todas rodam no CI.

### Backend — pytest

Suíte em `backend/tests/` (≈80 casos) rodando contra um Postgres real:

| Arquivo | Cobre |
|---|---|
| `test_auth.py` | register/login/me/logout, erros de validação e o rate limit de login |
| `test_projects.py` | CRUD de projetos e arquivos, duplicar, thumbnail e isolamento entre usuários |
| `test_codegen.py` | grafo → script Qiskit |
| `test_runner.py` | `/run`, `/terminal`, jobs, limites por usuário e erros do executor |
| `test_vault.py` | publicar, buscar, preço, bloqueio de projeto pago, filtros, tags, clone, curtidas, comentários |
| `test_email.py` | links de recuperação de senha e o alerta de `localhost` |
| `test_migrations.py` | roda `alembic upgrade head` num banco vazio e compara com os models (qualquer diferença falha) |

```bash
# Postgres descartável só para os testes (porta 55432, não conflita com o dev):
docker run -d --rm --name nf-test-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nodeforge_test -p 55432:5432 postgres:16-alpine

cd backend
DATABASE_URL_TEST="postgresql+asyncpg://postgres:postgres@localhost:55432/nodeforge_test" \
  uv run pytest

docker stop nf-test-pg
```

A conftest desliga o rate limiter (`RATE_LIMIT_ENABLED=false`) pro grosso
da suíte poder empilhar requests sem dormir entre cada um; os testes de
limite religam explicitamente. A produção nunca seta essa env var.

### Frontend — Vitest (unitários)

`pnpm test` roda os testes `*.test.ts` de `frontend/src/`:

- `stores/editor.test.ts` — undo/redo, agrupamento de edições, arraste e exclusão de nodos
- `lib/price.test.ts` — leitura de preços digitados (`29,90`, `R$ 1.234,56`, …), limites e formatação

### Ponta a ponta — Playwright

Specs em `frontend/tests/e2e/` que rodam contra a stack inteira no ar:

- `auth.setup.ts` — cadastra e loga **um** usuário compartilhado (respeita o limite de 3 cadastros/min por IP) e grava a sessão em `playwright/.auth/`
- `auth.spec.ts` — redirect quando deslogado (`/projects` → `/login?next=`), register → login → projects → logout, login a partir de página em inglês
- `editor.spec.ts` — autosave com edição durante o save, save ao sair, exclusão de nodo com as conexões, undo de arraste
- `hello-world.spec.ts` — executa um Bell state no sandbox e valida que só aparecem `|00>` e `|11>`
- `vault.spec.ts` — publica um projeto pago pelo editor, confere a prévia bloqueada para visitantes, o filtro Grátis/Pagos e a troca de preço pelo autor

```bash
cd frontend
pnpm install
pnpm test:e2e:install   # baixa Chromium + libs do sistema
pnpm test:e2e           # com a stack no ar em http://localhost:3000
```

Se a sua distribuição não for suportada pelo Playwright, rode pelo container
oficial (mesma versão do `package.json`):

```bash
cd frontend
docker run --rm --network host --ipc=host -u $(id -u):$(id -g) -e HOME=/tmp \
  -e CI=true -e PLAYWRIGHT_BASE_URL=http://localhost:3000 -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-noble ./node_modules/.bin/playwright test
```

O browser fica fixado em `pt-BR` (locale + `Accept-Language`) pra os
seletores casarem com os textos do produto. Para abrir o painel de
debug interativo do Playwright: `pnpm test:e2e:ui`.

---

## CI/CD

### CI — `.github/workflows/ci.yml`

Roda em todo push pra `main` e em todo PR. Quatro jobs em paralelo:

| Job | O que faz |
|---|---|
| **frontend** | `pnpm install` + `lint` + `typecheck` + testes unitários (Vitest) + `build` |
| **backend** | `uv sync` + `ruff check` + `ruff format --check` + `pytest` (com `postgres:16-alpine` como service container) |
| **executor** | `uvx ruff check` + `uvx ruff format --check` |
| **e2e** | Sobe a stack inteira via Docker Compose, instala Chromium, roda a suíte Playwright, publica o HTML report como artifact em todo run |

Concurrency é agrupada por ref — push novo cancela run em andamento da
mesma branch.

### Deploy — `.github/workflows/deploy.yml`

Dispara quando o CI da `main` termina com sucesso (ou manualmente). Detalhes
em [Deploy em produção](#deploy-em-produção).

### Segurança proativa

- **Dependabot** (`.github/dependabot.yml`) escaneia toda semana
  (segunda 06:00 America/Sao_Paulo) cada superfície de dependência:
  GitHub Actions, npm em `frontend/`, pip em `backend/` e `executor/`, e
  bases de imagem Docker. Minor/patch são agrupados; major vem como PR
  individual.
- **CodeQL** (`.github/workflows/codeql.yml`) analisa
  `javascript-typescript` e `python` em todo push/PR e re-roda no
  cron de sábado 09:00 UTC. Queries `security-extended` +
  `security-and-quality`.

---

## Deploy em produção

A produção roda numa VM na Oracle Cloud, em `/opt/node-forge`, com
`docker-compose.yml` + `docker-compose.prod.yml` e o Caddy na frente
(certificado TLS automático, `www` → domínio principal).

### Fluxo

```
push na main → CI verde → Deploy (SSH na VM) → smoke test em /api/health
```

O job de deploy entra na VM por SSH (chave no secret `DEPLOY_SSH_KEY`) e:

1. Faz `git pull` e descobre o que mudou (frontend, backend, executor, compose/Caddyfile)
2. **Constrói as imagens novas enquanto as antigas continuam no ar.** O frontend compila o bundle (`next build`) dentro da imagem (stage `prod` do `frontend/Dockerfile`), então um build quebrado para o deploy sem derrubar o site
3. Faz um **backup do banco** (`pg_dump`) em `/opt/node-forge/backups/` — mantém os 10 mais recentes
4. Aplica as **migrações** (`alembic upgrade head`) antes de trocar o backend
5. Roda `docker compose up -d`, que recria só os serviços cuja imagem ou configuração mudou — a troca leva poucos segundos
6. Confere que o **site público** está servindo o build novo (`/build-rev.txt`); se não estiver, reinicia o Caddy uma vez e, persistindo, falha o deploy em vez de reportar sucesso

### Regras para não quebrar o deploy

- **Migrações precisam ser aditivas** (colunas novas com default, tabelas novas). Elas rodam com o backend antigo ainda no ar
- Em produção o backend roda o código da imagem, **sem `--reload` e sem bind-mount** — mudar arquivo no servidor não altera nada até o próximo deploy
- O script chega ao servidor pela entrada padrão (`ssh … 'bash -s'`), por isso fica todo dentro de uma função chamada com `</dev/null`: um `docker compose exec`/`run` solto consumiria o resto do script

### Como conferir o que está no ar

- `https://node-forge.com.br/build-rev.txt` mostra o commit do frontend publicado
- Cada deploy publica uma anotação **deploy diagnostics** no run do GitHub Actions (revisões, contêineres, imagens, redes), visível sem acesso SSH

---

## Estrutura do repositório

```
node-forge/
├── .github/
│   ├── workflows/               # ci.yml (4 jobs) + deploy.yml + codeql.yml
│   └── dependabot.yml           # Weekly Monday scans
│
├── frontend/                    # Next.js 16 App Router
│   ├── tests/e2e/               # Playwright: setup + specs + helpers
│   ├── playwright.config.ts
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── [locale]/        # Rotas localizadas (pt-BR | en)
│   │   │   │   ├── (auth)/      # login, register, forgot-password, reset-password
│   │   │   │   ├── (app)/       # projects, profile, projects/[id]
│   │   │   │   └── (public)/    # vault, vault/[slug] (sem login)
│   │   │   └── api/[...path]/   # BFF proxy → backend
│   │   ├── components/
│   │   │   ├── brand/           # Logo, Wordmark
│   │   │   ├── editor/          # Canvas, palette, panels, terminal, etc.
│   │   │   ├── profile/         # Profile + dialogs
│   │   │   ├── vault/           # Vitrine, detalhe, publicar, capas e selos de preço
│   │   │   └── ui/              # shadcn primitives
│   │   ├── i18n/                # next-intl wiring (routing, navigation, request)
│   │   ├── lib/                 # server-api, price, vault, graph-types, imports-catalog
│   │   ├── proxy.ts             # Auth gate + locale routing
│   │   └── stores/editor.ts     # Zustand store (com undo/redo)
│   ├── messages/                # pt-BR.json + en.json
│   ├── next.config.ts
│   └── Dockerfile               # stages: base (dev) e prod (build + next start)
│
├── backend/                     # FastAPI + SQLAlchemy
│   ├── tests/                   # pytest suite
│   ├── src/
│   │   ├── auth/                # login, register, change me, forgot/reset, rate limit
│   │   ├── projects/            # CRUD + files + thumbnail + duplicate
│   │   ├── users/               # profile + avatar
│   │   ├── runner/              # codegen (graph → python) + /run + /terminal + /jobs
│   │   ├── vault/               # marketplace: listings, preço, tags, clone, likes, comments
│   │   ├── email/               # Resend sender + templates
│   │   ├── db/                  # SQLAlchemy models + session
│   │   └── config.py            # Settings (pydantic-settings)
│   ├── alembic/
│   │   └── versions/            # 0001..0009 (users … vault, preço das listagens)
│   ├── pyproject.toml
│   ├── uv.lock
│   └── Dockerfile
│
├── executor/                    # FastAPI sandboxed runner
│   ├── src/main.py              # POST /run — spawn ephemeral container
│   ├── pyproject.toml
│   └── Dockerfile
│
├── infra/                       # gvisor-setup.md + notas de infraestrutura
├── docker-compose.yml           # Stack de desenvolvimento
├── docker-compose.prod.yml      # Overlay de produção (Caddy, imagens prod, valores fixados)
├── Caddyfile                    # Proxy reverso + TLS de produção
├── .env.example                 # Template versionado
├── .env                         # SEU env local (gitignored)
├── .gitignore
└── README.md
```

---

## Trabalhando em equipe

Quando outro dev do time clona o repo, ele **não recebe seu `.env`** (está
gitignored, por design — ele contém JWT_SECRET, RESEND_API_KEY e outros
segredos). O setup do colega é:

```bash
git clone https://github.com/edunotorious/node-forge.com.br.git node-forge
cd node-forge
cp .env.example .env
# editar .env com valores próprios (geração de JWT_SECRET com openssl etc.)
docker compose up -d --build
```

Pra **compartilhar segredos** entre time (ex: chave Resend de staging, JWT
secret de produção), use:

- **Curto prazo / time pequeno:** 1Password, Bitwarden Family, ou outro password
  manager com vault compartilhado
- **Médio prazo:** [Doppler](https://doppler.com) ou [Infisical](https://infisical.com)
  — UI bonita, integra com Docker Compose, injeta env em CI/CD
- **Em produção:** AWS Secrets Manager, GCP Secret Manager, Vault da
  HashiCorp, ou GitHub Actions Secrets pro pipeline de deploy

**Nunca** mande segredos por Slack, email ou Notion — mesmo "só por um minuto".
Histórico de mensagem fica retido. E como o repositório é público, um segredo
commitado por engano precisa ser **rotacionado**, mesmo que o arquivo seja
apagado depois.

### Fluxo de PR

1. Cria branch local: `git checkout -b feat/coisa-nova`
2. Trabalha, commita (Conventional Commits: `feat:`, `fix:`, `chore:`, etc.)
3. Roda os testes (pytest, `pnpm lint`, `pnpm typecheck`, `pnpm test` e o E2E com a stack no ar)
4. `git push -u origin feat/coisa-nova`
5. Abre PR no GitHub apontando pra `main`
6. Outro dev revisa, dá aprovação, merge — **o merge na `main` dispara o deploy em produção**

---

## Aviso sobre o executor

O serviço `executor` monta `/var/run/docker.sock` pra subir containers efêmeros
com Qiskit. **Isso dá acesso root-equivalente à máquina host.** As camadas que
existem hoje:

- containers efêmeros sem rede, `user=nobody`, todas as capabilities removidas, limite de memória/CPU/processos e timeout
- no máximo `MAX_CONCURRENT_RUNS` execuções ao mesmo tempo, e limite de 20 runs/min e 60 comandos de Terminal/min por usuário
- runtime **gVisor** opcional (`RUNNER_RUNTIME=runsc`) para isolar as syscalls do código do usuário — passo a passo em [infra/gvisor-setup.md](infra/gvisor-setup.md)

Mesmo assim, o `docker.sock` continua sendo o maior risco aberto: o ideal é
trocar por um sandbox que não dependa dele (Firecracker microVMs, rootless
Docker, ou uma VM descartável por execução).

---

## Roadmap

### Já entregue

- ✅ Editor visual de circuitos (multi-arquivo por projeto)
- ✅ Codegen + execução sandboxed via Aer Simulator
- ✅ REPL Python no Terminal com preamble do arquivo
- ✅ Variables, Functions, Classes editáveis com codegen
- ✅ Undo/redo (Ctrl+Z / Ctrl+Y) e autosave sem perda de edições
- ✅ Auth completa (register, login, change me, forgot/reset com email)
- ✅ Rate limiting nas rotas de auth e nas execuções/Terminal por usuário
- ✅ Profile com avatar upload (PNG/JPEG/WebP/GIF)
- ✅ Projects com duplicar, rename, thumbnail upload, context menu
- ✅ UI bilíngue PT-BR + EN
- ✅ Node Vault como marketplace: grátis/pago, vitrine com categorias, filtros e destaques
- ✅ Suítes pytest, Vitest e Playwright
- ✅ CI/CD GitHub Actions (lint + typecheck + testes + build + e2e em todo PR)
- ✅ Deploy automático na Oracle Cloud com TLS (Caddy), backup do banco antes das migrações e troca de containers em segundos
- ✅ Dependabot semanal + CodeQL (security-extended)
- ✅ Security headers no Next + proxy BFF endurecido

### Em planejamento

- **Checkout dos projetos pagos** do Vault (gateway a definir) e liberação do clone após a compra
- Pause / Stop reais no botão de run (hoje são stubs visuais)
- Stream de stdout em tempo real (WebSocket) — hoje vem em batch no final
- Mais nodos no catálogo (Toffoli, SWAP, gates parametrizados RX/RY/RZ, classical control)
- Welcome email no register
- Variables/Functions integrando como nodos no canvas (drag-to-call)

### Produção / hardening

- Substituir `docker.sock` por sandbox que não dependa dele — **maior risco aberto**
- `JWT_SECRET` / `INTERNAL_API_TOKEN` via secret manager (Doppler, AWS Secrets Manager, Vault), não `.env`
- Backups do banco fora da VM (hoje ficam em `/opt/node-forge/backups/`) e Postgres gerenciado
- Infraestrutura como código em `infra/` (Terraform para Oracle Cloud)
- Observabilidade: logs estruturados, métricas, tracing (OpenTelemetry)

---

## Licença

A definir. Sugestão: MIT pro código + CC-BY-SA pros assets de design (logo, copy).
Como o repositório já é público, vale adicionar um arquivo `LICENSE` na raiz
para deixar os termos explícitos.
