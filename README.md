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

Domínio público alvo: [node-forge.com.br](https://node-forge.com.br) (deploy ainda em planejamento).

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Envio de email](#envio-de-email-recuperação-de-senha)
- [Primeiro Hello World](#primeiro-hello-world)
- [Comandos úteis](#comandos-úteis)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Subindo pro GitHub](#subindo-pro-github)
- [Trabalhando em equipe](#trabalhando-em-equipe)
- [Aviso sobre o executor](#aviso-sobre-o-executor)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Funcionalidades

- **Editor visual**: drag-and-drop de gates quânticos no canvas (React Flow), edição de propriedades por nodo, undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`)
- **Múltiplos arquivos por projeto**: cada projeto pode ter vários circuitos (`Arquivo 1`, `Arquivo 2`, …)
- **Codegen automático**: grafo → script Python Qiskit válido
- **Execução sandboxed**: cada `▶` spawn um container Docker efêmero (256 MB, 1 CPU, sem rede, timeout 30s, user `nobody`, capabilities removidas)
- **REPL Python integrado**: aba Terminal roda Python real no sandbox; variáveis, funções e classes definidas no arquivo já vêm carregadas
- **Multi-tenant auth**: register/login com JWT em cookie httpOnly, mudar email/senha/username, recuperação de senha com email via Resend, rate limiting por IP
- **Profile completo**: avatar upload (PNG/JPEG/WebP/GIF, até 2 MB), Vault profile (nome, bio, site, redes sociais, país), edição inline
- **Projects**: grid de cards, duplicar projeto (clona arquivos), upload de thumbnail, rename, delete, context menu por click direito
- **i18n**: UI completamente bilíngue (PT-BR + EN) via next-intl, language switcher no header
- **Async runs**: polling do `GET /jobs/:id` para circuitos longos não travarem a conexão

---

## Arquitetura

```
                           ┌────────────────────────┐
                           │  Browser do usuário    │
                           │  (http://localhost:3000)│
                           └─────────────┬──────────┘
                                         │ HTTPS only no futuro
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
   │  backend (FastAPI, port 8000)            │    │  postgres (port 5432)       │
   │  - auth + projects + users + runner      │◄──►│  - users, projects,         │
   │  - codegen (graph → Python)              │    │    project_files, jobs,     │
   │  - rate limit (slowapi)                  │    │    password_reset_tokens    │
   │  - email (Resend backend)                │    └─────────────────────────────┘
   └─────────────┬────────────────────────────┘
                 │ POST /run (token-auth)
                 ▼
   ┌──────────────────────────────────────────┐
   │  executor (FastAPI + docker SDK, :8001)  │
   │  - exposto SÓ na executor-net interna    │     ┌──────────────────────────┐
   │  - spawna container efêmero por /run     │────►│  runner ephemeral        │
   │  - mem 256m, 1 CPU, network_disabled,    │     │  python -u script.py     │
   │    user=nobody, cap_drop=ALL, pids=100   │     │  (mesma imagem executor) │
   │  - timeout 30s                           │     │  removido após exit      │
   └──────────────────────────────────────────┘     └──────────────────────────┘
```

Quatro serviços orquestrados via `docker-compose.yml`. O **frontend** é a única
origem que o browser acessa. O **backend** roda em rede interna e é alcançado via
o BFF do Next (que mantém o cookie httpOnly first-party). O **executor** spawna
containers efêmeros via `docker.sock` montado do host (root-equivalent — ver
[aviso](#aviso-sobre-o-executor)). O **postgres** persiste tudo num volume Docker.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · @xyflow/react (React Flow) · next-intl · TanStack Query · Zustand · react-hook-form + zod |
| Backend | FastAPI · SQLAlchemy 2 async · asyncpg · Alembic · uv · pyjwt · bcrypt · slowapi · httpx |
| Executor | FastAPI · Docker SDK · Qiskit · qiskit-aer · matplotlib · numpy |
| DB | Postgres 16 |
| Infra dev | Docker Compose |
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

- **Node 20+ e pnpm 10+** — só se quiser rodar `pnpm install` / `pnpm lint` no host
- **Python 3.12+ e [uv](https://docs.astral.sh/uv/)** — só se quiser regenerar `uv.lock` ou rodar `alembic` no host

---

## Rodando localmente

### 1. Clone

```bash
git clone https://github.com/<seu-usuario>/node-forge.git
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

Quando o postgres ficar healthy:

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
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais e nome do banco do Postgres local | `postgres` / `postgres` / `nodeforge` | Não em dev. Em produção, sim |
| `DATABASE_URL` | URL de conexão do backend ao Postgres | `postgresql+asyncpg://postgres:postgres@postgres:5432/nodeforge` | Não em dev |
| `JWT_SECRET` | Chave HMAC pra assinar tokens JWT do cookie de auth | placeholder | **Sim, sempre.** Gere uma única por ambiente |
| `JWT_ALGORITHM` | Algoritmo de assinatura | `HS256` | Não |
| `JWT_EXPIRE_DAYS` | Duração do cookie de sessão | `7` | A gosto |
| `EXECUTOR_URL` | URL interna do serviço executor | `http://executor:8001` | Não |
| `EXECUTOR_TIMEOUT_SECONDS` | Limite máx de execução de um run | `30` | A gosto |
| `CORS_ORIGINS` | Origens permitidas (hoje só localhost; o proxy BFF substitui em prod) | `http://localhost:3000` | Sim em prod |
| `COOKIE_SECURE` | Flag `Secure` do cookie httpOnly | `false` (dev) | `true` em prod |
| `INTERNAL_API_TOKEN` | Segredo compartilhado entre Next BFF e FastAPI (defense-in-depth) | placeholder | **Sim, sempre.** Único por ambiente |
| `EMAIL_BACKEND` | Backend de envio de email | `stdout` (printa link no log) | Troca pra `resend` em prod |
| `EMAIL_FROM` | Remetente dos emails | `Node-Forge <onboarding@resend.dev>` | Troca pelo seu domínio verificado |
| `RESEND_API_KEY` | API key da Resend | vazio | Sim, se `EMAIL_BACKEND=resend` |
| `APP_BASE_URL` | URL pública usada para links em emails | `http://localhost:3000` | Sim em prod |
| `BACKEND_INTERNAL_URL` | URL que o Next usa server-side pro backend | `http://backend:8000` | Não |
| `NEXT_PUBLIC_API_URL` | URL placeholder pra curl no host | `http://localhost:8000` | Não |
| `NEXT_TELEMETRY_DISABLED` | Desliga telemetria anônima do Next | `1` | Não |

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

Pra **produção** mude tudo o que diz "Sim" na coluna da tabela.

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

# Rebuild (após mudança em Dockerfile ou pyproject.toml)
docker compose up -d --build

# Rebuild de um serviço só
docker compose up -d --build backend

# Shell dentro do backend
docker compose exec backend bash

# Rodar uma migration nova
docker compose exec backend uv run alembic upgrade head

# Criar uma nova migration
docker compose exec backend uv run alembic revision -m "descricao"

# Type-check frontend
docker compose exec frontend pnpm exec tsc --noEmit

# Lint frontend
docker compose exec frontend pnpm lint

# Lint backend
uv run --project backend ruff check backend/src/
```

---

## Estrutura do repositório

```
node-forge/
├── frontend/                    # Next.js 16 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── [locale]/        # Rotas localizadas (pt-BR | en)
│   │   │   │   ├── (auth)/      # login, register, forgot-password, reset-password
│   │   │   │   └── (app)/       # projects, profile, projects/[id]
│   │   │   └── api/[...path]/   # BFF proxy → backend
│   │   ├── components/
│   │   │   ├── brand/           # Logo, Wordmark
│   │   │   ├── editor/          # Canvas, palette, panels, terminal, etc.
│   │   │   ├── profile/         # Profile + dialogs
│   │   │   └── ui/              # shadcn primitives
│   │   ├── i18n/                # next-intl wiring (routing, navigation, request)
│   │   ├── lib/                 # server-api, graph-types, imports-catalog
│   │   ├── proxy.ts             # Auth gate + locale routing
│   │   └── stores/editor.ts     # Zustand store (com undo/redo)
│   ├── messages/                # pt-BR.json + en.json
│   ├── next.config.ts
│   └── Dockerfile
│
├── backend/                     # FastAPI + SQLAlchemy
│   ├── src/
│   │   ├── auth/                # login, register, change me, forgot/reset, rate limit
│   │   ├── projects/            # CRUD + files + thumbnail + duplicate
│   │   ├── users/               # profile + avatar
│   │   ├── runner/              # codegen (graph → python) + /run + /terminal + /jobs
│   │   ├── email/               # Resend sender + templates
│   │   ├── db/                  # SQLAlchemy models + session
│   │   └── config.py            # Settings (pydantic-settings)
│   ├── alembic/
│   │   └── versions/            # 0001..0007 (users, projects, jobs, files, profile, thumbnail, password reset)
│   ├── pyproject.toml
│   ├── uv.lock
│   └── Dockerfile
│
├── executor/                    # FastAPI sandboxed runner
│   ├── src/main.py              # POST /run — spawn ephemeral container
│   ├── pyproject.toml
│   └── Dockerfile
│
├── infra/                       # Terraform stubs (TODO)
├── docker-compose.yml
├── .env.example                 # Template versionado
├── .env                         # SEU env local (gitignored)
├── .gitignore
└── README.md
```

---

## Subindo pro GitHub

Se você ainda não tem o repo remoto criado, faça pela UI do GitHub
(`https://github.com/new`) com nome `node-forge`, deixe **vazio** (sem README,
sem .gitignore, sem licença) — esse repo já tem tudo isso.

Depois, no terminal na raiz do projeto:

```bash
# Confirma que .env não está sendo trackeado (precisa estar VAZIO o output)
git status | grep -F ".env"

# Adiciona o remote (use SSH se você tem chave configurada, ou HTTPS)
git remote add origin git@github.com:<seu-usuario>/node-forge.git
# ou
git remote add origin https://github.com/<seu-usuario>/node-forge.git

# Push da branch main
git push -u origin main
```

A partir daí, fluxo padrão de git (`git pull`, `git push`, `git checkout -b feature/...`).

> **Antes do primeiro push, dá uma olhada no histórico**: se em algum commit
> passado um `.env` (ou outro segredo) foi commitado por engano, **rotacione
> as chaves afetadas** — o histórico do Git é público depois que você sobe o
> repo, mesmo se o arquivo for deletado depois.

---

## Trabalhando em equipe

Quando outro dev do time clona o repo, ele **não recebe seu `.env`** (está
gitignored, por design — ele contém JWT_SECRET, RESEND_API_KEY e outros
segredos). O setup do colega é:

```bash
git clone https://github.com/<owner>/node-forge.git
cd node-forge
cp .env.example .env
# editar .env com valores próprios (geração de JWT_SECRET com openssl etc.)
docker compose up -d --build
docker compose exec backend uv run alembic upgrade head
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
Histórico de mensagem fica retido.

### Fluxo de PR

1. Cria branch local: `git checkout -b feat/coisa-nova`
2. Trabalha, commita (Conventional Commits: `feat:`, `fix:`, `chore:`, etc.)
3. `git push -u origin feat/coisa-nova`
4. Abre PR no GitHub apontando pra `main`
5. Outro dev revisa, dá aprovação, merge (squash recomendado pra manter histórico limpo)

---

## Aviso sobre o executor

O serviço `executor` monta `/var/run/docker.sock` pra subir containers efêmeros
com Qiskit. **Isso dá acesso root-equivalente à máquina host.** Em desenvolvimento
na sua máquina é aceitável (foi o trade-off pra ter sandbox real sem precisar
de tooling avançada). Mas este design **não é seguro pra produção** sem
substituição por sandbox de verdade — gVisor, Firecracker microVMs, rootless
Docker, ou uma VM descartável por execução.

Não suba este `docker-compose.yml` como está em servidor compartilhado nem
em produção sem ler [Aviso de produção](#roadmap) e tomar uma das ações de
hardening listadas.

---

## Roadmap

### Já entregue (MVP)

- ✅ Editor visual de circuitos (multi-arquivo por projeto)
- ✅ Codegen + execução sandboxed via Aer Simulator
- ✅ REPL Python no Terminal com preamble do arquivo
- ✅ Variables, Functions, Classes editáveis com codegen
- ✅ Undo/redo (Ctrl+Z / Ctrl+Y)
- ✅ Auth completa (register, login, change me, forgot/reset com email)
- ✅ Rate limiting nas rotas de auth
- ✅ Profile com avatar upload (PNG/JPEG/WebP/GIF)
- ✅ Projects com duplicar, rename, thumbnail upload, context menu
- ✅ UI bilíngue PT-BR + EN

### Em planejamento

- Pause / Stop reais no botão de run (hoje são stubs visuais)
- Stream de stdout em tempo real (WebSocket) — hoje vem em batch no final
- Mais nodos no catálogo (Toffoli, SWAP, gates parametrizados RX/RY/RZ, classical control)
- Welcome email no register
- Variables/Functions integrando como nodos no canvas (drag-to-call)

### Produção / hardening

- Substituir `docker.sock` por sandbox seguro (gVisor / Firecracker / rootless docker)
- Postgres gerenciado (RDS, Cloud SQL, Supabase)
- TLS no domínio com Let's Encrypt + reverse proxy (Caddy ou Traefik)
- CI/CD via GitHub Actions (test → build → deploy)
- Infraestrutura como código em `infra/` (Terraform para Oracle Cloud ou AWS)
- Observabilidade: logs estruturados, métricas, tracing (OpenTelemetry)

---

## Licença

A definir. Sugestão: MIT pro código + CC-BY-SA pros assets de design (logo, copy).
Adicione um arquivo `LICENSE` na raiz antes de tornar o repo público se quiser
deixar explícito.
