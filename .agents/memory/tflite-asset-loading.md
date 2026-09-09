---
name: Carregamento TFLite no Android
description: Compatibilidade entre assets Expo e o carregador nativo do react-native-fast-tflite
---

No APK Android release, a presença de um arquivo `.tflite` dentro de `assets/` não garante que o carregador nativo consiga abri-lo. O `react-native-fast-tflite` usa um carregador Android baseado em `java.net.URL`, que pode não interpretar corretamente o URI interno retornado por um `require()` de asset.

**Why:** Um build preview confirmou que os modelos e as bibliotecas nativas estavam dentro do APK, mas o runtime ainda falhava ao carregar o modelo por causa do formato do URI.

**How to apply:** Resolva o módulo com `Asset.fromModule(require(...))`, execute `downloadAsync()`, confirme `localUri` e passe `{ url: localUri }` para `loadTensorflowModel`. Mantenha o modelo empacotado para que a resolução continue offline.