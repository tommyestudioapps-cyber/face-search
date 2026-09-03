---
name: Auditoria de dependências Expo
description: Limitações conhecidas dos avisos transitivos do toolchain Expo/Metro.
---

O toolchain Expo/Metro do SDK 54 pode manter `image-size` vulnerável mesmo na
última versão publicada, sem versão corrigida disponível no registry. O
`esbuild` corrigido também pode conflitar com o peer dependency de
`esbuild-plugin-pino`.

**Why:** overrides major cegos podem quebrar o Metro ou o build do servidor;
esses avisos devem ser tratados como risco do toolchain, não declarados como
resolvidos sem atualizar o pai compatível.

**How to apply:** atualizar Metro/Expo ou o par `esbuild`/`esbuild-plugin-pino`
juntos quando houver versões compatíveis; até lá, registrar o aviso no relatório
e não expor o parser do Metro a entradas remotas não confiáveis.