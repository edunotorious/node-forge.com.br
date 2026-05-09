# Infra (TODO)

Deploy na Oracle Cloud Infrastructure (OCI) será implementado em fase posterior.

## Estrutura prevista

```
infra/
├── README.md           (este arquivo)
└── oci/                (TODO — Terraform stubs)
```

## Pontos abertos antes de começar

- **Sandbox de execução.** Em dev usamos `docker.sock` mountado no executor — inviável
  em produção. Avaliar gVisor (`runsc`), Firecracker microVMs, ou subir uma VM efêmera
  por job via OCI API.
- **Postgres.** Autonomous Database vs container Postgres em VM. Custo vs operação.
- **TLS no domínio.** Let's Encrypt via cert-manager (se for k8s) ou caddy/traefik
  (se for VM única).
- **CI/CD.** GitHub Actions buildando imagens, push pra OCI Registry, deploy.
- **Observabilidade.** Logs centralizados (Loki?) e métricas (Prometheus?).

Nada disso é feito ainda. Mantido aqui apenas como marcador.
