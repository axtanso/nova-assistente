# VEGA · Assistente pessoal

Assistente por voz que roda no navegador do computador e instala como app no celular. Usa o Gemini do Google no plano gratuito, clima do Open-Meteo e notícias de feeds RSS de veículos reais.

## O que ela faz

- Conversa por voz ou texto, com respostas faladas em português
- Palavra de ativação: com a escuta ligada, diga "Vega" seguido do pedido (Chrome e Edge)
- Briefing do dia falado: clima, compromissos, tarefas atrasadas e principais notícias
- Tarefas e lembretes por comando ("me lembre de pagar o boleto sexta às 9h")
- Memória de longo prazo, que você vê e apaga quando quiser
- Ajuda com conteúdo: ideias de post, roteiros curtos, legendas com hashtags e revisão de texto
- Funciona sem internet para consultar tarefas e memória (a IA precisa de conexão)

## Publicar no GitHub Pages (uma vez só)

1. Crie um repositório público no GitHub chamado `vega-assistente` e envie estes arquivos.
2. No repositório, abra **Settings → Pages**, em *Source* escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
3. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions** e salve. Isso deixa as notícias se atualizarem sozinhas.
4. Em **Actions → Atualizar notícias**, clique em **Run workflow** para buscar as primeiras notícias.
5. Em um ou dois minutos o app fica no ar em `https://SEU-USUARIO.github.io/vega-assistente/`.

## Instalar

**Computador (Chrome ou Edge):** abra o endereço e clique no ícone de instalar na barra de endereço. A Vega abre em janela própria e aparece no menu iniciar.

**Android (Chrome):** abra o endereço, toque nos três pontos e em **Instalar app** ou **Adicionar à tela inicial**.

**iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.

## Primeira configuração

1. Crie uma chave gratuita em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Abra a Vega, cole a chave e informe sua cidade.
3. Permita o microfone quando o navegador pedir.

A chave fica salva só no aparelho. Faça isso no computador e no celular.

## Bom saber

- **Plano gratuito do Gemini:** tem limite de pedidos por minuto e por dia, definido pelo Google. Quando passar do limite, a Vega avisa e volta a funcionar depois. O Google pode usar as conversas do plano gratuito para melhorar os produtos dele, então evite enviar senhas, documentos ou dados bancários.
- **Dados em cada aparelho:** tarefas, memória e conversa ficam no aparelho. Para levar ao outro, use **Ajustes → Exportar dados** e depois **Importar dados** no outro aparelho.
- **Lembretes:** tocam e notificam enquanto a Vega estiver aberta (mesmo em segundo plano no computador). Com o app totalmente fechado, não chegam.
- **Notícias:** mude as fontes em `scripts/feeds.json`. A atualização roda a cada 3 horas, das 6h às 21h.
- **Escuta contínua no celular:** o Android pode emitir um som a cada reinício do microfone. No celular, prefira o botão de microfone.
