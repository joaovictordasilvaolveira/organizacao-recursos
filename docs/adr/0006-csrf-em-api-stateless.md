# ADR 0006 — CSRF desligado na API stateless

Data: 12/11/2026. Status: aceito. Autor: João.

## Contexto

O SonarCloud aponta `java:S4502` ("proteção CSRF desabilitada") em `SecurityConfiguration`. CSRF é um ataque em que outro site faz o navegador da vítima enviar uma requisição usando credenciais que o navegador anexa sozinho, normalmente um cookie de sessão.

## Decisão

Manter o CSRF desligado, porque a API:

- é **stateless** (`SessionCreationPolicy.STATELESS`): não cria sessão nem cookie de autenticação;
- autentica cada requisição com **HTTP Basic**, enviado pelo cliente no cabeçalho `Authorization`;
- é consumida por clientes de API (testes, JMeter, integrações), não por formulários HTML servidos pelo próprio sistema.

Com o CSRF ligado, toda chamada `POST`/`PUT`/`DELETE` dos clientes de API precisaria buscar e reenviar um token que não protege nada nesse cenário.

## Riscos aceitos

- Um navegador que guardou credenciais Basic pode reenviá-las sozinho. Se um dia houver interface web no navegador, a autenticação deve passar a token no cabeçalho (ex.: Bearer) ou o CSRF deve ser religado com token.
- A issue `java:S4502` fica marcada como **Accepted** no SonarCloud, citando este ADR.

## Atualização — 16/11/2026: interface web (RF-15)

A interface web chegou, e com ela o risco do primeiro item acima. A decisão de manter o CSRF desligado continua válida, porque o navegador **nunca guarda a credencial sozinho**:

- a tela monta o cabeçalho `Authorization` no JavaScript (`fetch` com `credentials: 'omit'`); não há cookie nem sessão;
- toda chamada da tela manda `X-Requested-With: XMLHttpRequest`. Nesse caso o 401 sai **sem** `WWW-Authenticate`, então o navegador não abre a janela de login nativa e não passa a reenviar a senha em requisições de outros sites (`RespostaAcessoNegado`);
- outro site não consegue montar esse cabeçalho numa requisição para cá: o navegador bloqueia (CORS não está liberado);
- a credencial fica em `sessionStorage`, que some ao fechar a aba.

O risco que sobra é XSS: um script injetado leria o `sessionStorage`. Mitigações:

- CSP `script-src 'self'`, sem inline nem `eval`;
- todo dado da API é escrito com `textContent`;
- teste de integração da CSP e prova no navegador com um cadastro malicioso (`docs/evidencias/interface-web`).

Testes: `InterfaceWebIntegrationTest` (`chamadaDaInterfaceRecebe401SemDesafioBasicDoNavegador`, `arquivosDaInterfaceSaoPublicosComCsp`).

## Relacionados

ADR 0002 (autenticação e perfis).
