---
name: Mocks nativos em testes Node
description: Limitação do executor TSX ao testar módulos Expo nativos fora do runtime do dispositivo.
---

Testes Node do monorepo Expo não devem importar diretamente o corredor que carrega `react-native`, MediaLibrary e módulos Expo nativos. O loader TSX pode transformar esses pacotes antes que os mocks sejam aplicados. Para testar a política de lotes, use o contrato do `batchRunner`, MediaLibrary simulado e o repositório SQLite real.

**Why:** O runtime nativo não está disponível no executor Node, e a combinação CJS/ESM do TSX pode ignorar mocks locais ou tentar analisar Flow de `react-native`.

**How to apply:** Preserve a cobertura ponta a ponta do cursor, geração, persistência e `completeScan` no batchRunner; deixe testes do galleryIndexer real para um ambiente com loader nativo compatível.