---
name: Mocks nativos em testes Node
description: Limitação do executor TSX ao testar módulos Expo nativos fora do runtime do dispositivo.
---

Testes Node do monorepo Expo não devem importar diretamente o corredor que carrega `react-native`, MediaLibrary e módulos Expo nativos. O loader TSX pode transformar esses pacotes antes que os mocks sejam aplicados. Para testar a política de lotes, use o contrato do `batchRunner`, MediaLibrary simulado e o repositório SQLite real.

**Why:** O runtime nativo não está disponível no executor Node, e a combinação CJS/ESM do TSX pode ignorar mocks locais ou tentar analisar Flow de `react-native`.

**How to apply:** Preserve a cobertura ponta a ponta do cursor, geração, persistência e `completeScan` no batchRunner; deixe testes do galleryIndexer real para um ambiente com loader nativo compatível.

No Expo web, não carregue antecipadamente um serviço nativo que lê `AppState`; adie a importação do serviço e do listener ao caminho nativo. Nos testes Node, mantenha o import estático de `react-native` no serviço e instale o mock antes de importar o módulo.

**Why:** A importação antecipada de `AppState` acionou a proteção de ponte do React Native em vez de `react-native-web`, e o `import('react-native')` dinâmico no serviço fez TSX/esbuild tentar transformar Flow nativo mesmo com mock.

**How to apply:** Ao integrar serviços com `AppState` à raiz web Expo, proteja o acesso com `Platform.OS` e faça o carregamento nativo apenas quando necessário; em testes, prefira `mock.module` antes do import do serviço.