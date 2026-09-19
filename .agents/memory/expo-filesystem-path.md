---
name: Expo FileSystem no monorepo
description: Localização e API disponível do expo-file-system neste workspace.
---

No monorepo, `node_modules/expo-file-system/build` pode não existir na raiz mesmo quando o pacote está instalado. A instalação efetiva fica acessível pelo link em `artifacts/busca-facial-local/node_modules/expo-file-system/build`, onde a API moderna exporta `File`, `Directory` e `Paths`.

**Why:** A verificação inicial na raiz falhou, mas o artifact usa uma instalação vinculada pelo workspace; concluir que a API está ausente sem localizar o link interromperia tarefas válidas.

**How to apply:** Ao verificar APIs Expo neste artifact, tente primeiro o caminho vinculado dentro de `artifacts/busca-facial-local/node_modules`; prefira `File`, `Directory` e `Paths.document` quando estiverem disponíveis.