---
name: Android build environment
description: Environment-specific constraints observed while validating the native Android build.
---

O build Android remoto do Expo/EAS falha imediatamente quando `EXPO_TOKEN` está inválido. O build local pode avançar até a instalação do NDK exigido pelo React Native, mas a cópia do NDK pode exceder a cota de disco do workspace mesmo depois de instalar Java, SDK, plataforma e build-tools.

**Why:** A validação de um APK real não pode ser substituída por bundle web ou prebuild; esses bloqueios impedem confirmar módulos nativos e landmarks em dispositivo.

**How to apply:** Antes de repetir a validação, testar a autenticação EAS com `whoami`; se estiver válida, preferir o perfil de desenvolvimento Android configurado. Só tentar build local quando houver SDK/NDK e espaço suficientes.