---
name: Inicialização do Dev Client
description: Causa confirmada de um crash nativo ao abrir o bundle no development client Android.
---

Não monte globalmente o provedor de `react-native-keyboard-controller` enquanto o app não usar seus componentes. O development client Android passou a abrir normalmente quando o provedor foi removido da raiz.

**Why:** O launcher do Expo abria e o Metro entregava o bundle, mas o processo fechava ao inicializar o app, sem exceção JavaScript. O aparelho confirmou que a remoção do provedor resolveu o crash, e os marcadores de startup chegaram até a tela principal.

**How to apply:** Se o controle avançado de teclado voltar a ser necessário, introduza-o somente na tela que o utiliza e valide a abertura em APK Android real antes de promovê-lo novamente para a raiz.