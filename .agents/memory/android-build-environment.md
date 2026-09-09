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

Este workspace pode executar o prebuild Android e validar plugins/assets, mas não dispõe de JDK, Android SDK, Gradle instalado ou ADB para compilar e instalar um APK localmente; o APK precisa vir de um build Android externo.

**Why:** O servidor Metro e o development URL não incluem os módulos nativos em um APK instalado, e a compilação Gradle falha antes de iniciar quando Java não está disponível.

**How to apply:** Use o prebuild para validar a configuração e a presença dos modelos, mas trate a execução do roteiro físico como bloqueada até haver um APK gerado por EAS ou outro ambiente Android e um aparelho conectado.