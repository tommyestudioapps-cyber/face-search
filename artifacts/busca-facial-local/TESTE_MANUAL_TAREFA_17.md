# Validação Android — rostos com pontos parciais

## Objetivo

Confirmar em um APK Android com o perfil `preview` que uma captura real sem
nariz e outra sem boca não são rejeitadas como `landmarks-incomplete` e chegam
ao estado `aligning` ou `completed`.

## Resultado desta execução — 03/09/2026

**Não reproduzível neste workspace.** A validação física não foi executada e,
portanto, não há confirmação nativa do comportamento no aparelho.

| Campo | Registro |
| --- | --- |
| Data | 03/09/2026 |
| Aparelho/modelo | Nenhum aparelho conectado ou disponível |
| Versão do Android | Não mensurável: não houve aparelho |
| Perfil do APK | `preview`, configurado em `eas.json` |
| APK instalado | Não |
| Captura real sem nariz | Não reproduzida |
| Captura real sem boca | Não reproduzida |
| Estado `landmarks-incomplete` → `aligning`/`completed` | Não observado em execução nativa |
| Resultado | Bloqueado por ambiente; requer APK e aparelho Android reais |

## Evidências do bloqueio

- Não existe arquivo `.apk` ou `.aab` no workspace.
- `adb` não está instalado/disponível.
- Java, `javac`, Android SDK (`sdkmanager`/`avdmanager`) e Gradle não estão
  disponíveis para gerar ou instalar um APK localmente.
- A autenticação EAS foi tentada com `pnpm dlx eas-cli@latest whoami`, mas o
  serviço respondeu `The bearer token is invalid`; por isso não foi possível
  iniciar um build remoto com o perfil `preview`.
- Nenhum workflow móvel estava executando uma instalação nativa; o preview do
  Expo não substitui um APK com os módulos nativos de captura facial.

## Evidência automatizada complementar

O teste de unidade existente foi executado em 03/09/2026:

```text
node --test services/faceCapture/__tests__/nativeAdapterCore.test.mjs
```

Resultado: **6 testes aprovados, 0 falhas**, incluindo:

- preservação de uma face nativa sem o landmark do nariz até o cálculo do
  recorte;
- preservação de uma face nativa sem os landmarks da boca até o cálculo do
  recorte;
- recorte quadrado dentro dos limites da imagem nos dois cenários.

Esses testes usam landmarks sintéticos e confirmam o mapeamento e a geometria
do alinhamento, mas não substituem a execução do MediaPipe em Android.

## Rechecagem do ambiente para a tarefa 20 — 03/09/2026

Os pré-requisitos foram conferidos novamente neste workspace:

| Verificação | Resultado |
| --- | --- |
| `adb` e aparelho Android | `adb` não está disponível; nenhum aparelho detectável |
| Java/Javac, Android SDK e Gradle | Não disponíveis no ambiente |
| APK/AAB instalável no workspace | Não encontrado |
| `static-build/android` | Contém somente `manifest.json`, não um APK |
| Perfil `preview` | Configurado em `eas.json` com `buildType: apk`, mas sem artefato gerado |
| Autenticação EAS | Falhou: bearer token inválido |
| Testes `test:face-capture` | 22 aprovados, 0 falhas |
| `typecheck` | Aprovado |

Assim, a tarefa 20 permanece sem confirmação física: não foi possível instalar
um APK preview, identificar fabricante/modelo ou versão do Android, nem
reproduzir as duas capturas em um dispositivo real. Os testes automatizados
continuam confirmando que os cenários sem nariz e sem boca chegam ao alinhamento
quando executados com landmarks fornecidos ao pipeline.

## Reexecução necessária

Quando houver acesso ao dispositivo:

1. Instalar um APK Android construído com o perfil `preview`.
2. Registrar fabricante/modelo e versão do Android.
3. Reproduzir uma foto/captura em que o nariz não tenha pontos detectados.
4. Reproduzir uma foto/captura em que a boca não tenha pontos detectados.
5. Confirmar que a UI não permanece em `landmarks-incomplete` e chega a
   `aligning` ou `completed`.
6. Anexar o resultado real a este registro.

## Rechecagem da tarefa 22 — 03/09/2026

A verificação foi repetida neste workspace antes de tentar confirmar as duas
capturas reais:

| Verificação | Resultado |
| --- | --- |
| `adb` | Não instalado/disponível |
| Dispositivo Android detectável | Nenhum |
| EAS CLI no shell do workspace | Não disponível |
| APK local para instalação | Não encontrado |
| Workflow Expo | Em execução, mas somente como preview; não é um APK nativo |
| Captura real sem nariz | Não reproduzida |
| Captura real sem boca | Não reproduzida |
| Estado `aligning`/`completed` em execução nativa | Não observado |

Não foi possível instalar um APK, identificar fabricante/modelo ou versão do
Android, nem observar o MediaPipe em um aparelho real. Esta tarefa permanece
bloqueada até a tarefa de desbloqueio do APK preview fornecer um artefato
instalável e um aparelho/emulador Android acessível.