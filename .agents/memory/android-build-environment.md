---
name: Android build environment
description: Environment-specific constraints observed while validating the native Android build.
---

O build Android remoto do Expo/EAS falha imediatamente quando `EXPO_TOKEN` está inválido. O build local pode avançar até a instalação do NDK exigido pelo React Native, mas a cópia do NDK pode exceder a cota de disco do workspace mesmo depois de instalar Java, SDK, plataforma e build-tools.

**Why:** A validação de um APK real não pode ser substituída por bundle web ou prebuild; esses bloqueios impedem confirmar módulos nativos e landmarks em dispositivo.

**How to apply:** Antes de repetir a validação, testar a autenticação EAS com `whoami`; se estiver válida, preferir o perfil de desenvolvimento Android configurado. Só tentar build local quando houver SDK/NDK e espaço suficientes.

O `expo install --check` pode ser executado sem token e confirmar dependências, mas `expo-doctor@latest` pode falhar ao invocar `expo config --full` neste workspace mesmo quando `expo config --json --full` executado diretamente passa.

**Why:** O diagnóstico do Doctor não deve ser tratado como prova de falha do app sem reproduzir o comando de configuração diretamente e separar problemas de autenticação/CLI de problemas do projeto.

**How to apply:** Registrar o erro do Doctor como diagnóstico inconclusivo, validar a configuração com o CLI Expo do próprio projeto e não substituir a validação nativa por esse resultado.

Este workspace pode expor Java, Gradle wrapper e `adb`, mas não dispõe necessariamente do Android SDK ou de um aparelho conectado; o prebuild valida plugins/assets, porém um APK instalável ainda depende de um ambiente Android completo.

**Why:** O servidor Metro e o development URL não incluem os módulos nativos em um APK instalado, e a compilação Gradle falha na configuração quando o SDK não está disponível, mesmo que Java e o wrapper Gradle estejam presentes.

**How to apply:** Use o prebuild para validar a configuração e a presença dos modelos; antes do roteiro físico, confirme SDK configurado, APK gerado e dispositivo listado por `adb devices`.

Para builds Android remotos deste app via Expo, o projeto precisa estar associado a um repositório GitHub com o código na branch usada pelo build e o diretório-base do monorepo informado; um repositório vazio ou apenas a conexão GitHub do workspace não basta.

**Why:** O serviço remoto recusou o build até a associação do repositório ao projeto Expo, mesmo depois de o código ter sido publicado no GitHub.

**How to apply:** Verifique a associação GitHub no projeto Expo antes de iniciar o build remoto e use `artifacts/busca-facial-local` como diretório-base.

Depois de executar o prebuild, o manifesto Expo pode receber versões nativas adicionais; o lockfile precisa ser regenerado antes do build remoto com instalação congelada.

**Why:** O builder rejeitou a instalação porque o manifesto e o importer do lockfile divergiam em Expo e React.

**How to apply:** Rode uma sincronização de lockfile e valide com `pnpm install --frozen-lockfile --lockfile-only` antes de reenviar o commit ao repositório do build.

Builds Android remotos do Expo também podem ser recusados por cota mensal da conta, mesmo com o projeto e o repositório corretamente configurados.

**Why:** A validação nativa fica bloqueada antes da fila de compilação quando a cota do serviço está esgotada; bundle web e configuração estática não substituem um APK.

**How to apply:** Confirme a cota antes de repetir o build remoto; se estiver bloqueado, entregue a validação estática e os testes locais sem alegar que o APK foi validado.