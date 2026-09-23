---
name: Segurança da varredura da galeria
description: Condições para remover registros órfãos do índice facial local após lotes.
---

A exclusão de registros locais depende de uma varredura completa com acesso integral à galeria. Ao retomar um lote, a geração persistida no SQLite deve corresponder à associada ao cursor; caso contrário, reinicie do início. Um cursor inválido ou uma seleção limitada de fotos não autoriza a limpeza.

**Why:** O cursor fica em armazenamento separado do índice SQLite, então uma interrupção pode deixar apenas um deles atualizado. Uma seleção limitada não representa todas as fotos do dispositivo.

**How to apply:** Ao alterar checkpoints, permissões ou paginação da galeria, preserve a regra de que somente o fim inequívoco de um ciclo integral exclui registros não vistos.