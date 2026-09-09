---
name: Plugins de configuração Expo 54
description: Compatibilidade de imports para config plugins no Expo SDK 54
---

No Expo SDK 54, plugins locais devem importar `withDangerousMod` e outras APIs de `expo/config-plugins`, usando o sub-export do pacote `expo`. Não adicione `@expo/config-plugins` como dependência direta apenas para satisfazer o import.

**Why:** O `expo-doctor` identifica `@expo/config-plugins` como pacote que não deve ser instalado diretamente, enquanto o sub-export do Expo resolve a API corretamente e permite que o prebuild carregue os plugins.

**How to apply:** Ao criar ou revisar plugins locais em projetos Expo 54, prefira `require('expo/config-plugins')` ou o import equivalente e valide com `expo prebuild` antes do build nativo.