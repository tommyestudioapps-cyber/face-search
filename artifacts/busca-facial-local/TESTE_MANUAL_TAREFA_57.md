# Validação Android — transição de acesso integral para limitado

## Objetivo

Confirmar em um Dev Client Android com a galeria real que uma execução iniciada
com acesso integral:

1. pode perder o acesso integral durante o processamento sem limpar órfãos;
2. mantém a foto que já foi salva no índice;
3. volta a remover a foto apagada somente depois de restaurar o acesso integral
   e concluir um novo ciclo completo.

## Resultado desta execução — 23/09/2026

**Bloqueado para confirmação física.** A preparação nativa, o typecheck e o
teste automatizado do contrato passaram, mas não foi possível instalar ou
executar um APK em um aparelho Android real nesta sessão.

| Verificação | Resultado |
| --- | --- |
| `test:background-indexing` | Aprovado; 1 teste, 0 falhas |
| `typecheck` | Aprovado |
| Prebuild Android | Aprovado |
| Permissões no manifesto | `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED` e `READ_EXTERNAL_STORAGE` presentes |
| Modelos nativos | `face-landmarker.task` e `face-recognition.tflite` presentes nos assets Android |
| APK instalado | Não; nenhum `.apk` ou `.aab` encontrado |
| Aparelho Android/ADB | Não; `adb devices -l` não listou dispositivos |
| Compilação local | Bloqueada pela ausência de Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT` vazios) |
| Transição na galeria real | Não reproduzida; requer APK e aparelho Android |

## Evidências da implementação

- `galleryPermission.ts` diferencia acesso disponível de acesso integral por
  meio de `accessPrivileges === 'all'`.
- `batchRunner.ts` só inicia ou continua um lote quando o consentimento está
  aceito e o acesso integral está disponível. Ao perder esse acesso, limpa o
  cursor e não inicia a limpeza de órfãos.
- `galleryIndexer.ts` calcula `canPrune` apenas para a galeria inteira com
  acesso integral. A geração só é concluída com `completeScan` depois de uma
  varredura completa e de uma nova confirmação de acesso integral.
- A suíte Node cobre o contrato da transição com galeria simulada: a foto
  preservada permanece após o acesso limitado, `completeScan` não é chamado
  nesse ciclo e a foto apagada só é removida após o ciclo integral seguinte.

## Roteiro pendente no aparelho

1. Instalar um APK `development` ou `preview` com os modelos nativos.
2. Conceder acesso a todas as fotos e aceitar a indexação em segundo plano.
3. Iniciar um lote com pelo menos uma foto a manter e uma foto já removida da
   galeria; durante o processamento, alterar a permissão do app para acesso
   limitado, mantendo a foto já salva na seleção.
4. Confirmar que o lote para sem remover órfãos e que a foto mantida continua
   no índice.
5. Restaurar o acesso a todas as fotos e aguardar o ciclo completo seguinte.
6. Confirmar que a foto removida da galeria é excluída do índice somente nesse
   ciclo.