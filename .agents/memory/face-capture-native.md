---
name: Native face capture constraints
description: Non-obvious constraints for the local MediaPipe face-capture pipeline.
---

O `react-native-mediapipe` usado pelo app recebe um caminho de arquivo local na análise de imagem estática; URIs `content://` precisam ser normalizadas antes. O bundle retornado pelo Android contém um frame em `results`, e os rostos ficam aninhados em `faceLandmarks`, não em um item por rosto. O modelo `.task` também precisa ser copiado para `android/app/src/main/assets` por config plugin durante o prebuild.

Qualquer detector nativo criado localmente para análise one-shot precisa de liberação determinística em `finally`; ser elegível a GC não garante que os recursos nativos sejam liberados. Uma indexação longa em Android físico confirmou heap estável e conclusão sem LMKD após a limpeza.

**Why:** Sem normalização, o Android pode não conseguir decodificar a origem escolhida; sem achatar `faceLandmarks`, a UI ignora rostos adicionais; sem o asset nativo, o detector falha mesmo com o modelo no bundle Metro. Sem fechar um detector one-shot, o GC não libera deterministicamente sua memória nativa.

**How to apply:** Preserve a fachada da captura e mantenha essas adaptações no adaptador/preprocessamento. Libere recursos nativos em caminhos de sucesso e erro; valide indexações repetidas com heap monitorado em Android físico. Valide o prebuild Android antes de testar o detector em APK; a compilação local também requer Java/Android SDK no ambiente.