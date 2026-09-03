# Verificação da linha de base

## Escopo

Verificação inicial do projeto antes das próximas ações Android. Esta etapa não
alterou arquivos de aplicação; o único arquivo criado é este registro
documental.

## Data

03/09/2026

## Testes automatizados

Foram executados os três grupos da suíte facial:

| Suíte | Resultado |
| --- | --- |
| `test:face-capture` | 22 aprovados, 0 falhas |
| `test:face-overlay` | 2 aprovados, 0 falhas |
| `test:face-search` | 5 aprovados, 0 falhas |
| **Total** | **29 aprovados, 0 falhas** |

Os testes emitiram apenas o aviso de `MODULE_TYPELESS_PACKAGE_JSON` do Node
para módulos TypeScript carregados diretamente. Esse aviso não causou falhas.

## Verificação de tipos

O typecheck foi executado individualmente, com `--noEmit` e
`--incremental false`, nos pacotes que possuem `tsconfig.json`:

- `artifacts/api-server`
- `artifacts/busca-facial-local`
- `artifacts/mockup-sandbox`
- `scripts`

Resultado: **todos passaram**.

## Modelos

### `assets/models/face-landmarker.task`

- Presente e não vazio.
- Tamanho: `3.758.596` bytes.
- SHA-256:
  `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- Validação ZIP: **passou**, sem erros de integridade.

### `assets/models/face-recognition.tflite`

- Presente e não vazio.
- Tamanho: `5.233.552` bytes.
- SHA-256:
  `be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854`.
- Identificador FlatBuffer nos bytes 4–7: `TFL3`.

## Arquivos de configuração

Os arquivos abaixo estão presentes e são JSON válidos:

- `artifacts/busca-facial-local/app.json`
- `artifacts/busca-facial-local/eas.json`
- `artifacts/busca-facial-local/package.json`

Também foi confirmada a coerência mínima:

- pacote Android: `com.buscafacial.local`;
- perfil EAS `preview`: `android.buildType: "apk"`;
- perfil EAS `development`: `developmentClient: true`;
- perfil EAS `development`: `android.buildType: "apk"`;
- atalho `build:apk` presente na raiz e no pacote mobile.

## Resultado da linha de base

**Aprovada para prosseguir ao próximo passo.**

O código e os artefatos locais estão consistentes para iniciar a preparação do
APK Android. Esta verificação não comprova ainda:

- compilação nativa das bibliotecas Android;
- execução dos config plugins no prebuild;
- carregamento dos modelos dentro do APK;
- instalação em dispositivo;
- comportamento real de câmera, MediaPipe, SQLite ou TFLite.

Esses pontos permanecem para a etapa de geração e validação do APK nativo.