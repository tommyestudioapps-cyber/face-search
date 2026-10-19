---
name: Indexação como requisito do produto
description: Importância comercial da indexação Android com a interface fechada e bibliotecas grandes.
---

O usuário considera essencial indexar bibliotecas de mais de 10 mil fotos com a tela apagada e o aplicativo removido dos recentes, inclusive quando a conclusão exige dias.

**Why:** Sem indexação automática em segundo plano, o usuário considera a busca facial enfadonha e o produto comercialmente inviável.

**How to apply:** Tratar continuidade e retomada persistente como requisitos centrais, não melhorias opcionais. Distinguir retirada dos recentes de parada forçada e não prometer execução ininterrupta contra restrições do Android.

Uma falha em `updateIndexingProgress` não deve liberar o wake lock enquanto o batch ainda processa fotos. O wake lock deve continuar sendo renovado independentemente do sucesso da notificação; `stopIndexingForeground` o libera quando o loop termina, e o timeout de 10 minutos cobre encerramentos inesperados.

**Why:** Liberá-lo durante um batch permitiria que a CPU suspendesse no meio do processamento, reproduzindo o problema que a indexação em foreground deve evitar.

**How to apply:** Não vincular a vida do wake lock ao sucesso de `notifee.displayNotification` em atualizações de progresso. Liberar ao encerrar o loop; manter o timeout como proteção contra crash.
