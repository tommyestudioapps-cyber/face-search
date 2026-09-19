---
name: Testes Node com TypeScript
description: Compatibilidade de imports em tempo de execução com o executor Node usado pelos testes do app.
---

No executor `node --experimental-strip-types --test`, imports de runtime entre módulos TypeScript podem falhar com `ERR_MODULE_NOT_FOUND` quando o caminho relativo não inclui a extensão do arquivo.

**Why:** o Node resolve o módulo em modo ESM nativo, enquanto o typecheck do TypeScript aceita resolução sem extensão; os dois comandos podem apresentar resultados diferentes.

**How to apply:** ao adicionar um import de valor entre arquivos `.ts` que será carregado diretamente pelos testes Node, validar o comando de teste imediatamente e preservar o padrão de extensão compatível com o executor.