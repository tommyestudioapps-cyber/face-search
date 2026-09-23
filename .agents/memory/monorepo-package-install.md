---
name: Instalação de pacotes no app móvel
description: Limitação do instalador automático de pacotes em um workspace pnpm com artefatos.
---

O instalador automático de pacotes Node executa `pnpm add` na raiz deste workspace e não aceita argumentos `--filter` como nomes de pacotes.

**Why:** A instalação na raiz foi recusada pelo pnpm e a tentativa de passar `--filter` ao instalador foi rejeitada como pacote inválido. Instalar na raiz alteraria o pacote errado.

**How to apply:** Para dependências exclusivas de um artefato, após consultar a habilidade de gerenciamento de pacotes, use `pnpm --filter @workspace/<artefato> add ...` de forma direcionada e confira manifest/lockfile.