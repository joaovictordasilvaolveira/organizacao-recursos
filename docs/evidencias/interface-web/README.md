# Interface web (RF-15) — teste de ponta a ponta no navegador

Executado em **16/11/2026** com Playwright (Chromium), contra a aplicação local:

- `mvnw spring-boot:run`, PostgreSQL 17 do `compose.yaml`;
- branch `feat/joao-interface-web-rf15`;
- usuários sintéticos, um por perfil: Ana (Solicitante), Rui (Responsável) e o Administrador inicial. Senha gerada para a sessão e não versionada.

Catálogo usado:

- salas A-101 e LAB-2, comuns;
- sala AUD-1, restrita;
- professores P-01 e P-02;
- materiais PROJ-1 e NOTE-5.

## Roteiro e resultado

| # | Perfil | Passo | Esperado | Resultado | Evidência |
|---|---|---|---|---|---|
| 1 | Solicitante | entrar | abas "Minhas reservas" e "Catálogo"; sem "Relatório" | ok | [01](01-solicitante-reservas.png) |
| 2 | Solicitante | reservar A-101 + P-02 + PROJ-1, 20/11 08h–10h | "Reserva aprovada.", linha com os 3 recursos | ok | [01](01-solicitante-reservas.png) |
| 3 | Solicitante | reservar LAB-2 com o mesmo P-02 no mesmo horário | recusa com mensagem clara (RF-05) | ok: "Algum recurso já está reservado nesse horário…" | [02](02-conflito-professor.png) |
| 4 | Solicitante | reservar AUD-1 (restrito) | "Reserva enviada para aprovação.", situação "Aguardando aprovação" (RF-07) | ok | [01](01-solicitante-reservas.png) |
| 5 | Solicitante | recarregar a página | sessão continua (sessionStorage da aba) | ok | — |
| 6 | Responsável | entrar | lista já filtrada em "Aguardando aprovação", com Aprovar/Rejeitar | ok | [03](03-responsavel-aprovacao-retirada.png) |
| 7 | Responsável | aprovar AUD-1 | "Reserva aprovada." | ok | [03](03-responsavel-aprovacao-retirada.png) |
| 8 | Responsável | registrar retirada da A-101 | situação "Em uso", botão "Registrar devolução" (RF-09) | ok | [03](03-responsavel-aprovacao-retirada.png) |
| 9 | Responsável | relatório de novembro | 2 reservas, 1 conflito evitado, 1 aprovada, 1 em uso, 2 h por recurso (RF-12) | ok | [04](04-relatorio.png) |
| 10 | Administrador | cadastrar sala com tipo `<img src=x onerror=alert(1)>` e localização `<script>alert(2)</script>` | aparece como texto; nenhum script roda | ok: nenhum diálogo aberto | [05](05-admin-catalogo-manutencao-xss.png) |
| 11 | Administrador | iniciar manutenção da LAB-2 | selo "Em manutenção", botão "Encerrar manutenção" (RF-08) | ok | [05](05-admin-catalogo-manutencao-xss.png) |

Console do navegador: o único erro foi o registro da resposta `409` do passo 3, que é o comportamento esperado. Não houve erro de JavaScript.

## Defeitos achados durante o teste

Os dois foram corrigidos antes do commit e estão no [registro de defeitos](../../defeitos/README.md):

- **D-10:** a mensagem de sucesso aparecia e sumia na hora.
- **D-11:** o botão "Sair" aparecia na tela de login.

## Limitação

O roteiro foi executado com o Playwright conduzido manualmente, não como teste automático no CI. A parte da API que a tela usa está coberta no CI por `InterfaceWebIntegrationTest`.
