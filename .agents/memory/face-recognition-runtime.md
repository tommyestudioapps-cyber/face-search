---
name: Local face recognition runtime
description: Native runtime and model constraints for on-device face embeddings.
---

O reconhecimento facial local usa `react-native-fast-tflite` com Nitro Modules em Development/Preview Builds, não Expo Go. O modelo MobileFaceNet adotado recebe imagens RGB 112×112, normalizadas por `(pixel - 128) / 128`, e produz 192 valores.

**Why:** O runtime é nativo e depende de prebuild; o modelo só funciona de forma determinística se a entrada e a dimensão de saída forem mantidas exatamente como definidas pelo artefato escolhido.

**How to apply:** Mantenha o arquivo `.tflite` nos assets locais, registre a extensão no Metro e copie o modelo para `android/app/src/main/assets` via config plugin antes de implementar embeddings, SQLite ou busca.