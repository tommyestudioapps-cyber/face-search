---
name: Native face capture constraints
description: Non-obvious constraints for the local MediaPipe face-capture pipeline.
---

O `react-native-mediapipe` usado pelo app recebe um caminho de arquivo local na análise de imagem estática; URIs `content://` precisam ser normalizadas antes. O bundle retornado pelo Android contém um frame em `results`, e os rostos ficam aninhados em `faceLandmarks`, não em um item por rosto. O modelo `.task` também precisa ser copiado para `android/app/src/main/assets` por config plugin durante o prebuild.

**Why:** Sem normalização, o Android pode não conseguir decodificar a origem escolhida; sem achatar `faceLandmarks`, a UI ignora rostos adicionais; sem o asset nativo, o detector falha mesmo com o modelo no bundle Metro.

**How to apply:** Preserve a fachada da captura e mantenha essas adaptações no adaptador/preprocessamento. Valide o prebuild Android antes de testar o detector em APK; a compilação local também requer Java/Android SDK no ambiente.