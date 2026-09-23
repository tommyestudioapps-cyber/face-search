---
name: Segurança da varredura da galeria
description: Condições para remover registros órfãos do índice facial local após lotes.
---

A exclusão de registros locais depende de uma varredura completa com acesso integral à galeria. Ao retomar um lote, a geração persistida no SQLite deve corresponder à associada ao cursor; caso contrário, reinicie do início. Um cursor inválido ou uma seleção limitada de fotos não autoriza a limpeza.

**Why:** O cursor fica em armazenamento separado do índice SQLite, então uma interrupção pode deixar apenas um deles atualizado. Uma seleção limitada não representa todas as fotos do dispositivo.

**How to apply:** Ao alterar checkpoints, permissões ou paginação da galeria, preserve a regra de que somente o fim inequívoco de um ciclo integral exclui registros não vistos.

A reserva da geração e a exclusividade da execução são garantias diferentes: uma geração pausada permanece ativa para retomada, mas apenas uma execução pode possuí-la por vez. Escritas de fotos precisam validar a posse da geração na mesma transação em que salvam os resultados.

**Why:** Um segundo runtime pode retomar a mesma geração sem chamar o início de uma geração nova; uma flag em memória ou só a reserva de geração não impede isso. Uma limpeza concorrente também poderia ser seguida por uma gravação tardia.

**How to apply:** Em mudanças nas operações faciais, mantenha a posse temporária da execução, a validação transacional das escritas e a recuperação quando o processo morre antes do primeiro checkpoint. Não apague o único cursor antes de invalidar a geração no SQLite.

O estado resumido da tarefa deve ser persistido no SQLite, mas a falha isolada dessa gravação não pode interromper a indexação ou fazer uma limpeza bem-sucedida parecer falha.

**Why:** O estado é necessário para recuperação e UI, porém é metadado; as fotos e embeddings continuam sendo a fonte de dados do índice e não devem ficar indisponíveis por uma falha transitória ao atualizar o resumo.

**How to apply:** Atualize o estado em transações pequenas e valide valores ao ler. Nos fluxos de trabalho, trate a persistência do resumo como best-effort, mantendo o erro real da operação separado.