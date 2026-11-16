# Changelog

## [v1.0.0-rc3] — 16/11/2026

### Novo: interface web (RF-15)

- Telas em `http://localhost:8080/`, servidas pela própria API (HTML, CSS e JavaScript puro, sem build extra):
  - **Solicitante:** pede, edita e cancela as próprias reservas e consulta o catálogo.
  - **Responsável:** aprova ou rejeita pedidos, registra retirada e devolução e gera o relatório de utilização.
  - **Administrador:** cadastra salas, professores e materiais, marca manutenção, altera e cancela reservas e gera o relatório.
- `GET /api/v1/reservas`: o Solicitante vê só as próprias reservas; Responsável e Administrador veem todas; filtro por estado.
- Salas, professores e materiais passam a informar `restrito`; salas e materiais também `emManutencao`.

### Segurança

- As páginas são públicas, mas os dados continuam exigindo login. A CSP só permite script e estilo do próprio servidor.
- O 401 das chamadas da tela não traz `WWW-Authenticate`, para o navegador não guardar a senha ([ADR 0006](docs/adr/0006-csrf-em-api-stateless.md) atualizado).

### Qualidade

- 242 testes, 0 pulados; cobertura de 98,6% das linhas e 91,3% dos branches.
- Roteiro no navegador com os três perfis, incluindo um cadastro malicioso exibido como texto ([evidências](docs/evidencias/interface-web/README.md)).
- Defeitos D-10 e D-11, achados no teste do navegador, corrigidos antes do merge.

## [v1.0.0-rc2] — 12/11/2026

### Correção

- **D-09 (RF-06):** com 50 pedidos simultâneos pela mesma sala, o pool de conexões esgotava e os perdedores recebiam timeout em vez de `409`. O conflito evitado agora é gravado depois que a transação da reserva termina. Teste de regressão com 20 pedidos simultâneos.

### Evidência nova

- JMeter com 50 usuários disputando a mesma sala, 3 rodadas: 1 `201`, 49 `409` e 0 erro técnico em cada, com persistência conferida no banco ([resultado-02](docs/performance/resultado-02.md)). O p95 ficou entre 1,1 s e 1,5 s (risco aceito R1).
- 225 testes, 0 pulados.

## [v1.0.0-rc1] — 12/11/2026

Primeira release candidate do sistema de organização de salas, professores e materiais.

### Funcionalidades

- **RF-01** Login HTTP Basic com perfis Solicitante, Responsável e Administrador; acesso negado por padrão.
- **RF-02** Cadastro e consulta de salas, professores e materiais.
- **RF-03** Pesquisa por texto, tipo e capacidade mínima.
- **RF-04** Criar, editar e cancelar reservas conforme perfil, titularidade e estado.
- **RF-05** Sala, professor e material não se sobrepõem no mesmo horário (restrição no banco).
- **RF-06** Duas reservas simultâneas: só uma é aceita.
- **RF-07** Recurso restrito exige aprovação ou rejeição do Responsável.
- **RF-08** Sala ou material em manutenção não entra em reserva nova.
- **RF-09** Retirada e devolução de recursos.
- **RF-10** Auditoria imutável de toda mudança, na mesma transação.
- **RF-11** Notificação externa depois do commit, com timeout de 2 s.
- **RF-12** Relatório de utilização, carga horária e conflitos evitados.
- **RF-13** Mensagens de erro neutras (400/401/403/404/409).
- **RF-14** README e contratos permitem reproduzir tudo a partir de um clone limpo.

### Qualidade

- 224 testes, 0 pulados; integração com PostgreSQL real (Testcontainers).
- Cobertura JaCoCo: 98,5% de linhas e 91,7% de branches.
- Quality Gate do SonarCloud aprovado.
- CI também roda em tags `v*`, para ligar a evidência à release candidate.

### Correções

Ver o [registro de defeitos](docs/defeitos/README.md).

### Limitações conhecidas

Ver os riscos aceitos na [decisão de qualidade](docs/decisao-qualidade.md).
