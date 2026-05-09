# Node-Forge

IDE em nuvem com programação visual baseada em nodos para computação quântica. Usuários
arrastam blocos no canvas, conectam, e executam o circuito com Qiskit — o código Python
é gerado a partir do grafo e roda num container Docker isolado, com resultados (texto e
imagens de histogramas/circuitos) retornando em tempo real para a UI.

O alvo é tornar Qiskit acessível para quem está aprendendo computação quântica sem
precisar escrever Python desde o primeiro dia. Cada nodo do canvas representa uma
operação (gate, medição, simulação, plot) e edges definem a ordem de execução. O backend
faz topological sort do grafo e emite um script Python equivalente, que é então
executado em sandbox.

Este repositório é um monorepo com três serviços (`frontend`, `backend`, `executor`) e
infraestrutura local via Docker Compose. O domínio público alvo é
[node-forge.com.br](https://node-forge.com.br) (deploy ainda a fazer).

## Pré-requisitos

- Docker Engine + plugin `docker compose`
- Node.js 20+
- pnpm 9+
- (opcional) Python 3.12+ e [`uv`](https://docs.astral.sh/uv/) — só se for desenvolver
  backend ou executor fora de container.

## Aviso importante sobre o executor

> O serviço `executor` monta `/var/run/docker.sock` para subir containers efêmeros com
> Qiskit. **Isso dá acesso root-equivalente à máquina host.** Em desenvolvimento na sua
> máquina é aceitável — mas este design **não é seguro pra produção** sem substituição
> por sandbox de verdade (gVisor, Firecracker, microVMs). Não suba este compose como
> está em servidor compartilhado nem em produção.

## Rodando localmente

```bash
cp .env.example .env
docker compose up --build

# em outra aba, depois que o postgres ficar healthy:
docker compose exec backend uv run alembic upgrade head
```

Endpoints:

| Serviço   | URL                       | Observação                                       |
| --------- | ------------------------- | ------------------------------------------------ |
| frontend  | http://localhost:3000     | Única origem que o browser deve acessar.         |
| backend   | http://localhost:8000     | Acesso direto só pra debug; UI usa proxy do Next.|
| executor  | http://localhost:8001     | Interno; chamado só pelo backend.                |
| postgres  | localhost:5432            | Credenciais em `.env`.                           |

## Estrutura

```
frontend/   Next.js 16 (App Router, TS, Tailwind, shadcn/ui, React Flow).
backend/    FastAPI (auth, projetos, geração de Python, orquestração).
executor/   FastAPI mínimo + Docker SDK (sandbox de código de usuário).
infra/      Stubs Terraform e docs de deploy (TODO).
```

## Deploy na Oracle Cloud (TODO)

Será feito em fase posterior. Stubs Terraform vão em `infra/oci/`. Pontos abertos:

- Substituir `docker.sock` por sandbox seguro (gVisor / Firecracker / VM descartável).
- Postgres gerenciado vs autogerenciado.
- TLS no domínio com Let's Encrypt.
- CI/CD via GitHub Actions.

## Status

Em construção. A spec interna do projeto descreve a ordem de implementação em 9 fases
(setup → backend skeleton → auth → frontend skeleton → CRUD projetos → editor com React
Flow → executor isolado → integração end-to-end → resto do catálogo de nodos).
