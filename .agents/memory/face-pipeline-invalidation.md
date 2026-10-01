---
name: Invalidação do pipeline facial
description: Manter a reindexação correta ao alterar o pipeline de detecção.
---

Persistir a identidade composta do modelo e do pipeline em cada foto indexada, mesmo quando a foto não gera embeddings. A invalidação deve consultar os registros de fotos, pois consultar somente embeddings não detecta imagens sem faces ou faces rejeitadas.

**Why:** Uma mudança na detecção ou na qualidade pode alterar o resultado de fotos que não tinham embeddings; sem versão por foto, a comparação com o modelo armazenado não consegue invalidá-las e a verificação de ativo inalterado pode ignorá-las.

**How to apply:** Ao mudar a detecção, incrementar `pipelineVersion`, usar a mesma identidade composta ao decidir se uma foto é inalterada e invalidar checkpoints de varredura que apontem para a versão anterior.