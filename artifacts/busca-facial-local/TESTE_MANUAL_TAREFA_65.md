# Validação Android — prioridade da busca manual durante a indexação

## Objetivo

Confirmar em um development build Android que:

1. uma busca manual iniciada durante um lote automático espera o checkpoint
   seguro antes de executar;
2. o lote automático retoma depois do ponto salvo;
3. as fotos já salvas no índice permanecem até a conclusão de um ciclo válido;
4. uma indexação manual solicitada enquanto há uma geração automática pausada
   não inicia uma geração concorrente nem perde o checkpoint.

## Resultado desta execução — 23/09/2026

**Bloqueado para confirmação física no APK.** A preparação do development
build e os contratos SQLite passaram, mas esta sessão não tinha um APK
instalável nem um aparelho/emulador Android conectado.

| Verificação | Resultado |
| --- | --- |
| `test:background-indexing` | Aprovado; 10 testes, 0 falhas |
| `test:face-search` | Aprovado; 13 testes, 0 falhas |
| `test:face-coordination` | Aprovado; 3 testes, 0 falhas |
| `typecheck` | Aprovado |
| Dev client/Metro | Iniciado; QR de development build publicado |
| Modelos nativos | `face-landmarker.task` e `face-recognition.tflite` presentes nos assets Android |
| APK instalado | Não; nenhum `.apk` ou `.aab` encontrado |
| Aparelho Android/ADB | Não; `adb devices -l` não listou dispositivos |
| Compilação Android local | Bloqueada antes da compilação por ausência de Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT` vazios) |
| Execução nativa com duas instâncias JS | Não reproduzida nesta sessão |

## Evidências automatizadas

- O teste `lote pausa no checkpoint para uma busca e retoma sem limpar
  resultados` salva o resultado da página, persiste o cursor, executa a busca
  manual e confirma que a foto salva continua no índice. Depois, um novo lote
  retoma usando o cursor salvo e conclui a geração.
- O teste `busca manual espera um lote e precede o próximo, sem descartar o
  checkpoint` confirma a ordem `primeiro lote → checkpoint preservado e pausa →
  busca manual → próximo lote`.
- O teste `lote não aborta uma geração manual ativa sem checkpoint` confirma
  que uma execução automática não toma posse nem aborta uma geração manual
  ativa.
- Os testes de repository cobrem duas conexões SQLite, retomadas concorrentes,
  cancelamento e validação transacional da geração antes de gravar fotos.

## Roteiro pendente no APK

1. Instalar um APK `development` ou `preview` contendo os modelos nativos.
2. Conceder acesso a todas as fotos e aceitar a indexação em segundo plano.
3. Iniciar um lote com fotos suficientes para mantê-lo em execução.
4. Durante o lote, iniciar uma busca manual e confirmar que ela só começa
   depois que a página atual for salva e o cursor persistido.
5. Confirmar que a busca encontra as fotos já salvas e que nenhuma delas some.
6. Confirmar que o lote seguinte retoma pelo cursor salvo, sem reiniciar a
   geração.
7. Pausar uma geração automática e solicitar uma indexação manual; confirmar
   que a execução manual espera a reserva existente e não cria uma geração
   concorrente.
8. Confirmar que a limpeza de fotos órfãs só ocorre depois do ciclo completo,
   nunca durante a pausa para a busca manual.
