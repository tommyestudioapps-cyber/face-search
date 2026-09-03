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

## Passo 3 — roteiro detalhado no aparelho físico Android

Este roteiro deve ser executado somente com um APK nativo instalado em um
aparelho Android real. O preview web e o Expo Go não substituem esta validação,
pois não carregam MediaPipe, SQLite e TFLite nativos.

### 3.1 Pré-condições e identificação do teste

Antes de abrir o app, registrar:

| Campo | Valor |
| --- | --- |
| Data e hora |  |
| Fabricante e modelo |  |
| Versão do Android |  |
| Arquitetura/ABI |  |
| Versão do APK |  |
| Perfil do build | `preview` |
| Pacote esperado | `com.buscafacial.local` |
| Espaço livre no aparelho |  |
| Quantidade aproximada de fotos na galeria |  |

Preparar também:

- pelo menos uma foto real em orientação normal;
- uma foto real em orientação EXIF 6;
- uma foto real em orientação EXIF 8;
- uma foto com um rosto nítido e bem enquadrado;
- uma foto com mais de um rosto, se disponível;
- acesso às configurações do Android para revogar permissões;
- uma forma de registrar screenshots, mensagens e logs sem incluir dados
  pessoais desnecessários.

### 3.2 Instalação limpa e abertura sem rede

1. Remover uma instalação anterior do app, se isso não apagar as fotos da
   galeria que serão usadas no teste.
2. Instalar o APK `preview`.
3. Ativar modo avião.
4. Confirmar que Wi-Fi e dados móveis permanecem desligados.
5. Abrir o app.
6. Aguardar o carregamento inicial completo.
7. Confirmar que o onboarding ou a Home aparece sem crash.
8. Avançar pelo onboarding sem rede.
9. Confirmar que nenhuma tela exige conexão para continuar.
10. Registrar qualquer mensagem de rede, tela em branco, travamento ou
    encerramento inesperado.

**Resultado esperado:**

- o app abre sem conexão;
- a interface permanece utilizável;
- o processamento facial continua sendo apresentado como local;
- não há upload ou chamada de rede necessária para abrir o app;
- nenhum crash ocorre durante a inicialização.

### 3.3 Concessão e revogação das permissões

Executar este caso com o app recém-instalado ou depois de limpar as permissões
nas configurações do Android.

#### Galeria

1. Abrir o app.
2. Avançar pelo onboarding.
3. Iniciar o fluxo de seleção pela galeria.
4. Quando solicitado, conceder acesso às fotos.
5. Selecionar uma foto real.
6. Confirmar que o app retorna ao fluxo de análise.
7. Registrar se o acesso foi completo ou limitado, quando o Android oferecer
   essa opção.
8. Fechar o app.
9. Abrir as configurações do Android e revogar o acesso às fotos.
10. Reabrir o app e tentar selecionar uma foto novamente.
11. Registrar a mensagem e confirmar que o app não fecha.
12. Conceder novamente a permissão e repetir a seleção.

#### Câmera

1. Revogar a permissão de câmera nas configurações do Android.
2. Voltar ao app.
3. Iniciar o fluxo de captura pela câmera.
4. Recusar a permissão na primeira solicitação.
5. Confirmar que o app não sofre crash.
6. Conceder a permissão quando solicitado novamente.
7. Capturar uma foto.
8. Confirmar que a foto chega ao fluxo de análise facial.
9. Revogar novamente a permissão nas configurações.
10. Tentar abrir a câmera mais uma vez e registrar o comportamento.

**Resultado esperado:**

- câmera e galeria solicitam suas permissões em runtime;
- conceder a permissão permite continuar o fluxo;
- negar ou revogar a permissão não encerra o app;
- o app não tenta acessar fotos ou câmera silenciosamente depois da revogação;
- após conceder novamente, o fluxo se recupera;
- nenhuma permissão de escrita de fotos é necessária.

Registrar separadamente:

| Recurso | Concedido | Negado | Revogado e recuperado | Crash |
| --- | --- | --- | --- | --- |
| Galeria |  |  |  |  |
| Câmera |  |  |  |  |

### 3.4 Rotação EXIF com fotos reais da galeria

Usar fotos reais que mantenham a orientação EXIF original. Não testar apenas
imagens previamente exportadas por aplicativos que já tenham gravado a rotação
nos pixels.

Para cada orientação:

1. Selecionar a foto pela galeria.
2. Confirmar que a miniatura inicial aparece na orientação correta.
3. Aguardar a análise facial.
4. Observar o overlay e o recorte do rosto.
5. Confirmar que o rosto não aparece girado, espelhado ou deslocado.
6. Confirmar que o alinhamento não fica preso em `detecting`, `validating` ou
   `landmarks-incomplete`.
7. Registrar o estado final.

Executar obrigatoriamente:

- EXIF 6: foto paisagem que deve ser apresentada como retrato;
- EXIF 8: foto retrato com rotação no sentido oposto;
- se possível, também EXIF 1, 2, 3, 4, 5 e 7.

**Resultado esperado:**

- a orientação visual corresponde à foto original;
- os landmarks e a bounding box acompanham o rosto correto;
- o recorte quadrado permanece dentro da imagem;
- a análise chega a `aligning` e, quando a qualidade for suficiente, a
  `completed`.

### 3.5 Carregamento do modelo MediaPipe

1. Manter o aparelho sem rede.
2. Selecionar uma foto com rosto nítido pela galeria ou capturar pela câmera.
3. Observar a sequência de estados da captura.
4. Confirmar que o modelo MediaPipe é carregado sem encerrar o app.
5. Confirmar que pelo menos uma face é detectada quando a foto é adequada.
6. Repetir com uma foto contendo mais de um rosto, se disponível.
7. Registrar:
   - número de faces detectadas;
   - estado de seleção, caso existam várias faces;
   - mensagens apresentadas;
   - tempo aproximado de processamento;
   - qualquer erro nativo.

**Resultado esperado:**

- o arquivo `face-landmarker.task` está disponível no APK;
- a captura não apresenta `native-module-unavailable`;
- a captura não apresenta erro de modelo ausente;
- uma face válida chega a `aligning` e depois `completed`;
- várias faces entram em seleção sem misturar os landmarks.

### 3.6 Carregamento do modelo TFLite e busca

1. Após uma captura alinhada, iniciar a busca.
2. Permitir que o app faça a primeira indexação da galeria.
3. Observar o estado `loading-model` ou equivalente no componente de progresso.
4. Confirmar que o app não encerra durante o carregamento do
   `face-recognition.tflite`.
5. Confirmar que a indexação não exige rede.
6. Aguardar a conclusão ou registrar o erro apresentado.
7. Executar uma segunda busca para confirmar que o modelo carregado pode ser
   reutilizado.

**Resultado esperado:**

- o arquivo `face-recognition.tflite` está disponível no APK;
- o modelo aceita o tensor RGB `112×112`;
- o modelo retorna um embedding de 192 valores;
- o embedding é normalizado sem erro;
- a busca retorna resultados ou uma lista vazia explicada, sem crash;
- nenhum dado é enviado para a API.

Se houver erro, registrar a mensagem completa e classificar como:

- modelo ausente;
- entrada incompatível;
- saída incompatível;
- falha de inferência;
- erro de módulo nativo;
- falta de memória ou timeout.

### 3.7 Inicialização e persistência do SQLite local

1. Com o aparelho ainda sem rede, iniciar uma busca.
2. Confirmar que o banco `face-search.sqlite` é inicializado sem mensagem de
   falha de armazenamento.
3. Aguardar que pelo menos uma foto seja processada.
4. Fechar o app normalmente.
5. Reabrir o app.
6. Executar uma nova busca sem apagar os dados.
7. Confirmar que o app não reinicializa o banco de forma destrutiva.
8. Repetir a indexação para observar se fotos inalteradas são reaproveitadas.
9. Se a interface permitir limpar o índice, executar a limpeza somente depois
   de registrar o estado anterior e confirmar a exclusão.

**Resultado esperado:**

- o SQLite abre no primeiro uso;
- as tabelas `indexed_photos` e `face_embeddings` são criadas;
- fotos e embeddings persistem após fechar e reabrir o app;
- uma segunda execução não provoca erro de migração;
- o cancelamento não apaga dados já completos;
- uma limpeza explícita remove apenas o índice local, não as fotos da galeria.

### 3.8 Roteiro mínimo de captura facial

Depois dos testes de infraestrutura, executar:

1. Uma foto com uma face válida.
2. Uma foto com mais de uma face.
3. Uma captura sem nariz detectado, se possível.
4. Uma captura sem boca detectada, se possível.
5. Uma face muito pequena.
6. Uma imagem desfocada.
7. Uma imagem escura.
8. Uma face parcialmente fora do quadro.

Para cada caso, registrar:

| Caso | Estado inicial | Estados observados | Estado final | Aceito/rejeitado | Mensagem |
| --- | --- | --- | --- | --- | --- |
| Face válida |  |  |  |  |  |
| Múltiplas faces |  |  |  |  |  |
| Sem nariz |  |  |  |  |  |
| Sem boca |  |  |  |  |  |
| Face pequena |  |  |  |  |  |
| Desfocada |  |  |  |  |  |
| Escura |  |  |  |  |  |
| Fora do quadro |  |  |  |  |  |

### 3.9 Evidências obrigatórias

Anexar ou registrar neste documento:

- fabricante, modelo e versão do Android;
- versão e perfil do APK;
- confirmação de instalação;
- screenshots da abertura offline;
- resultado das permissões concedidas, negadas e revogadas;
- resultado das fotos EXIF;
- confirmação de carregamento MediaPipe;
- confirmação de carregamento TFLite;
- confirmação de inicialização e persistência do SQLite;
- estados de captura observados;
- mensagens de erro completas, quando houver;
- observações de desempenho, aquecimento ou falta de memória.

Não registrar tokens, credenciais, caminhos privados ou imagens pessoais sem
necessidade.

### 3.10 Critérios de aprovação e parada

Considerar o roteiro aprovado somente se:

- o app abrir sem rede;
- câmera e galeria funcionarem após concessão;
- negar e revogar permissões não causarem crash;
- EXIF 6 e EXIF 8 forem tratados corretamente;
- MediaPipe carregar sem crash;
- TFLite carregar sem crash;
- SQLite inicializar e persistir dados;
- uma busca concluir sem rede;
- os estados reais forem registrados.

Parar o teste e registrar como bloqueio se:

- o APK não instalar;
- o app fechar ao abrir;
- qualquer modelo estiver ausente;
- o SQLite falhar na inicialização;
- o app exigir rede para uma função local;
- ocorrer corrupção de orientação EXIF;
- o app travar ao negar permissões;
- houver perda de dados após cancelamento ou reabertura.