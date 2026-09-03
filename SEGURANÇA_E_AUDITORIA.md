# Segurança e auditoria

**Projeto:** Busca Facial Local  
**Data da auditoria:** 03/09/2026  
**Escopo:** dependências do workspace, servidor auxiliar de arquivos estáticos,
configuração de builds Expo/EAS e fluxo local do Metro.

## Resumo executivo

As duas descobertas HIGH do SAST foram corrigidas. O servidor de arquivos agora
restringe métodos, valida segmentos de caminho, resolve symlinks dentro de
`static-build`, trata hosts inválidos com segurança e envia cabeçalhos
restritivos, incluindo CSP com nonce para o HTML de landing page.

As dependências transitivas corrigíveis foram atualizadas por overrides do pnpm
e o lockfile foi regenerado. A auditoria final ainda identifica duas
vulnerabilidades HIGH em `image-size@1.2.1` sem versão corrigida publicada e
uma vulnerabilidade LOW em `esbuild@0.27.3`. Esses pacotes pertencem ao
toolchain do Expo/Metro e não são usados pelo runtime de reconhecimento facial
ou pelo servidor auxiliar para receber imagens de usuários.

## Estado antes das correções

- **Dependency audit:** 0 críticas, 13 altas, 5 moderadas e 2 baixas no
  snapshot inicial.
- **SAST:** 2 avisos HIGH em `server/serve.js`, relacionados à montagem de
  caminhos a partir da requisição.
- **HoundDog:** nenhum achado de privacidade ou fluxo de dados.
- `app.json` continha uma origem externa explícita no plugin do Expo Router.
- O processo Metro recebia o ambiente completo do processo pai.

## Correções aplicadas

### Dependências

O `pnpm audit --fix` foi aplicado e o lockfile foi atualizado. Os overrides
cobrem as versões corrigidas de:

- `postcss`
- `fast-uri`
- `brace-expansion`
- `js-yaml`
- `nanoid`
- `qs`
- `decode-uri-component`

O override automático para `esbuild >=0.27.3 <0.28.1` foi removido porque
causava conflito com o peer dependency de `esbuild-plugin-pino` e não é
necessário para o runtime do aplicativo. O projeto mantém `esbuild@0.27.3`
como dependência de desenvolvimento até que o plugin tenha compatibilidade com
a versão corrigida.

### Servidor de arquivos estáticos

- Manifestos iOS e Android usam caminhos constantes, sem indexação dinâmica.
- Arquivos estáticos aceitam apenas segmentos não vazios, sem `.`/`..`,
  separadores alternativos ou caracteres fora da lista permitida.
- O caminho físico é canonicalizado e comparado com a raiz, bloqueando escapes
  por symlink.
- Apenas `GET` e `HEAD` são aceitos.
- Hosts e protocolos encaminhados são validados antes de montar deep links.
- Foram adicionados CSP, nonce por resposta, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`.

### Builds e configuração

- `app.json` não declara mais uma origem externa para o Expo Router.
- `eas.json` contém somente os perfis `development` e `preview`, sem URLs,
  chaves, tokens ou variáveis de ambiente.
- Builds com perfil `production` exigem `REPLIT_INTERNAL_APP_DOMAIN` e recusam
  fallback para domínio de preview.
- O Metro recebe somente variáveis de execução necessárias e as variáveis
  públicas `EXPO_PUBLIC_DOMAIN`/`EXPO_PUBLIC_REPL_ID`; segredos do processo pai
  não são propagados para o bundle.
- O domínio usado nos bundles é validado como host sem credenciais, caminho,
  query string ou fragmento.

## Estado após as correções

| Verificação | Resultado |
| --- | --- |
| SAST | **0 achados** |
| HoundDog | **0 achados** |
| Dependency audit | 0 críticas, 2 altas, 0 moderadas, 1 baixa |
| Typecheck do app Expo | passou |
| Typecheck do API server | passou |
| Testes faciais, overlay e busca | 17 passaram |
| Workflow Expo | `RUNNING` |

## Riscos transitivos restantes

### `image-size@1.2.1` — HIGH

O scanner reporta loops infinitos ao analisar arquivos ICNS, JXL e HEIF
malformados. A versão disponível no registry (`2.0.2`) continua afetada e o
scanner não informa uma versão corrigida. O pacote é puxado pelo Metro/Expo
durante o build e não pelo código de reconhecimento em produção. O fluxo do
aplicativo usa imagens locais e não expõe um endpoint que aceite esses buffers
para o parser.

**Ação pendente:** atualizar o Metro/Expo quando uma versão que remova ou
corrija esse parser estiver disponível; não foi aplicado um override de versão
major incompatível que pudesse quebrar o SDK 54.

### `esbuild@0.27.3` — LOW

O aviso é específico do servidor de desenvolvimento no Windows. O ambiente de
build atual é Linux, o servidor de arquivos não usa o servidor HTTP do esbuild
e `esbuild-plugin-pino` ainda declara compatibilidade restrita. A atualização
automática foi revertida para evitar um conflito de peer dependency.

**Ação pendente:** atualizar `esbuild` e `esbuild-plugin-pino` juntos quando
houver uma combinação compatível.

## Limitações da validação

- Não há dispositivo Android, emulador ou ADB disponível neste ambiente; a
  validação nativa do APK continua pendente.
- A auditoria de dependências inclui ferramentas de desenvolvimento transitivas
  do Expo/Metro, mesmo quando elas não entram no runtime do APK.
- Nenhum segredo foi adicionado ao repositório, ao `eas.json` ou ao bundle.