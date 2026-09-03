# Teste manual — Tarefa 11

## Objetivo

Confirmar no APK Android que a orientação EXIF, o alinhamento facial e a limpeza
dos arquivos temporários funcionam em fotos reais, sem apagar a foto original.

## Preparação

1. Gere ou instale um APK de desenvolvimento/preview com os modelos nativos.
2. Use pelo menos um aparelho Samsung, Xiaomi ou Motorola.
3. Ative a depuração USB somente se for inspecionar o armazenamento por `adb`.
4. Separe:
   - uma foto vertical feita pela câmera traseira;
   - uma foto horizontal feita pela câmera traseira;
   - uma selfie feita pela câmera frontal;
   - cópias dessas fotos com o rosto inclinado para a esquerda/direita;
   - uma foto escura e uma foto com luz forte.

## 1. Foto vertical e horizontal — EXIF

1. Abra o app e conceda acesso às fotos quando solicitado.
2. Escolha a foto vertical pela galeria.
3. Confirme que a imagem aparece na orientação visual correta, sem ficar deitada.
4. Confirme que o retângulo do rosto acompanha olhos, nariz e boca.
5. Selecione o rosto e avance até a prévia do recorte.
6. Verifique que o recorte é quadrado, centralizado e não corta o queixo ou a testa.
7. Repita os passos 2–6 com a foto horizontal.
8. Repita com a selfie da câmera frontal e confirme que o rosto não fica
   invertido ou deslocado lateralmente.
9. Repita a seleção usando uma foto compartilhada por outro aparelho, pois
   provedores `content://` podem entregar EXIF de forma diferente.

Resultado esperado:

- Fotos verticais permanecem verticais.
- Fotos horizontais permanecem horizontais.
- O rosto detectado fica na posição correta em ambas.
- A imagem original não é alterada.

## 2. Iluminação e rotação facial

1. Selecione a foto escura.
2. Confirme que o app informa iluminação insuficiente sem gerar um recorte
   enganoso.
3. Selecione a foto com luz forte.
4. Confirme o tratamento de iluminação excessiva.
5. Selecione uma foto com o rosto levemente inclinado.
6. Confirme que o recorte gira para nivelar a linha dos olhos.
7. Teste inclinações para os dois lados.
8. Confirme que olhos, nariz e boca ficam dentro do centro do recorte e que o
   recorte continua quadrado.
9. Teste uma inclinação acima do limite aceito e confirme a mensagem de rotação
   excessiva.

Resultado esperado:

- A inclinação aceita é corrigida sem esticar o rosto.
- O recorte final mantém proporção 1:1 e tamanho 224×224.
- Fotos fora dos critérios de qualidade são rejeitadas explicitamente.

## 3. Inspeção do cache Android

### Pelo próprio aparelho

1. Faça uma captura/análise e selecione um rosto.
2. Volte para a tela inicial ou cancele a captura.
3. Abra **Configurações → Aplicativos → Busca Facial Local → Armazenamento**
   (o nome dos menus pode variar por fabricante).
4. Verifique que a foto original continua na galeria.
5. Repita a inspeção após desmontar a tela ou fechar/reabrir o fluxo de seleção.

### Com ADB, se disponível

Use o pacote `com.buscafacial.local`:

```bash
adb shell run-as com.buscafacial.local find cache -type f -print
adb shell run-as com.buscafacial.local find files -type f -print
```

Execute os comandos antes da captura, logo após o recorte e depois de cancelar
ou sair da tela. Arquivos intermediários criados pelo pipeline devem desaparecer
após a limpeza. O banco SQLite do índice pode permanecer, pois ele contém os
registros persistentes da galeria e os embeddings locais.

Resultado esperado:

- Nenhum JPEG intermediário permanece após cancelamento, reset ou desmontagem.
- O arquivo final usado imediatamente pela busca só permanece enquanto o fluxo
  está ativo; ao sair, também é removido.
- A foto original da galeria nunca é apagada.

## Registro do teste

- Aparelho/modelo:
- Versão do Android:
- Perfil do APK:
- Foto vertical:
- Foto horizontal:
- Câmera frontal:
- Iluminação:
- Inclinação:
- Cache limpo após cancelamento:
- Cache limpo após desmontagem:
- Observações: