# Validação Android — limpeza segura do índice local

## Objetivo

Confirmar que o painel de configurações exibe as estatísticas persistidas,
solicita confirmação antes da limpeza, remove somente o índice local e mantém
as fotos originais da galeria.

## Resultado desta execução — 03/09/2026

**Bloqueado para confirmação física.** A lógica e as verificações estáticas
passaram, mas não foi possível executar o roteiro em um APK instalado em um
aparelho Android real.

| Verificação | Resultado |
| --- | --- |
| Home → botão de configurações | Implementado; `settings-button` abre o painel |
| Fotos e rostos indexados | Estatísticas lidas do SQLite por `getStoredIndexStats()` |
| Cancelar no `Alert.alert` | Implementado; o botão Cancelar não chama a limpeza |
| Confirmar a limpeza | Implementado; estado local volta para 0 após sucesso |
| Fotos originais da galeria | Preservadas pela implementação; a limpeza só executa SQL no índice |
| Reabrir e reutilizar SQLite | Não observado em execução nativa |
| APK instalado | Não |
| Dispositivo Android/ADB | Não disponível |
| Logs nativos do SQLite | Não coletados; não houve execução em aparelho |
| Resultado físico | Não reproduzido; requer APK e aparelho Android |

## Evidências da implementação

- `components/IndexSettings.tsx` apresenta `stats.indexedPhotos` e
  `stats.indexedFaces`.
- O alerta de confirmação informa explicitamente que as fotos originais não
  serão apagadas. A ação destrutiva só é iniciada pelo botão `Limpar índice`.
- `hooks/useFaceSearch.ts` atualiza as estatísticas, progresso, resultados e
  estado para os valores vazios somente depois que `clearStoredIndex()` termina
  com sucesso. Falhas mantêm os dados exibidos e mostram uma mensagem.
- `services/faceSearch/repository.ts` executa a limpeza em uma transação
  exclusiva com `DELETE FROM face_embeddings` e `DELETE FROM indexed_photos`.
  Não há chamada para apagar ativos da `expo-media-library`.
- As tabelas têm relação de cascata entre embeddings e registros do índice, e
  a inicialização usa `openDatabaseAsync('face-search.sqlite')` com migração
  idempotente.

## Verificações automatizadas

Executadas no pacote `@workspace/busca-facial-local`:

| Verificação | Resultado |
| --- | --- |
| `test:face-capture` | 25 aprovados, 0 falhas |
| `test:face-overlay` | 2 aprovados, 0 falhas |
| `test:face-search` | 6 aprovados, 0 falhas |
| `typecheck` | Aprovado |
| Inspeção SQL da limpeza/estatísticas | 6 verificações aprovadas |
| Prebuild Android | Aprovado; plugins nativos e modelos copiados para os assets Android |
| Workflow Expo | Metro iniciado sem erros; preview de development build |

Essas verificações não substituem a execução nativa: não confirmam a
persistência do SQLite, o comportamento real do `Alert.alert` ou a permanência
das fotos na galeria do aparelho.

## Evidências do bloqueio

- `adb` não está instalado/disponível.
- Java, `javac`, Gradle e Android SDK não estão disponíveis.
- Nenhum arquivo `.apk` ou `.aab` foi encontrado no workspace.
- `pnpm dlx eas-cli@latest whoami` rejeitou todas as variantes de token EAS disponíveis; não foi possível obter um APK remoto.
- O workflow disponível é apenas o servidor Metro/preview; ele não equivale a
  um APK com os módulos nativos de SQLite, Media Library e reconhecimento facial.
- `CI=1 pnpm exec expo prebuild --platform android --no-install` concluiu com sucesso e confirmou os plugins nativos.
- O prebuild copiou `face-landmarker.task` e `face-recognition.tflite` para
  `android/app/src/main/assets`.
- A tentativa de `android/gradlew :app:assembleRelease --no-daemon` foi bloqueada
  antes da compilação porque `JAVA_HOME` não está definido e não há `java` no PATH.

## Roteiro para repetir em um aparelho Android

1. Instalar um APK `preview` ou `development` com os modelos nativos.
2. Abrir a Home e tocar no botão de configurações.
3. Registrar os valores de fotos e rostos indexados.
4. Tocar em **Limpar índice local**, escolher **Cancelar** e confirmar que os
   valores permanecem iguais.
5. Abrir o alerta novamente, escolher **Limpar índice** e confirmar que ambas as
   estatísticas retornam a zero.
6. Abrir a galeria do aparelho e confirmar que as fotos usadas no índice ainda
   estão disponíveis.
7. Fechar e reabrir o app, iniciar uma nova busca e confirmar que o SQLite
   continua utilizável sem recriar ou corromper o índice.
