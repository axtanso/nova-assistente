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

## Widget no iPhone

1. Instale o app gratuito **Scriptable** na App Store.
2. No iPhone, abra `https://raw.githubusercontent.com/axtanso/vega-assistente/main/widget/vega-widget.js`, toque e segure no texto, **Selecionar Tudo** e **Copiar**.
3. No Scriptable, toque em **+**, cole o código, renomeie o script para **VEGA** e toque em ▶ (permita acesso ao Calendário e aos Lembretes).
4. Na tela de início, toque e segure num espaço vazio, toque em **+**, escolha **Scriptable**, o tamanho **Grande** e **Adicionar Widget**.
5. Toque e segure no widget, **Editar Widget**, em **Script** escolha **VEGA**.

Os temas das notícias ficam na lista `INTERESSES`, no início do script.

## Conectar Gmail e Google Agenda (uma vez só)

1. Abra [console.cloud.google.com](https://console.cloud.google.com) com a sua conta Google e crie um projeto chamado **VEGA**.
2. Em **APIs e serviços → Biblioteca**, ative a **Gmail API** e a **Google Calendar API**.
3. Em **Google Auth Platform** (ou **Tela de consentimento OAuth**), clique em **Começar**: nome **VEGA**, seu e-mail, público **Externo**. Depois, em **Público → Usuários de teste**, adicione o seu Gmail.
4. Em **Clientes → Criar cliente**, escolha **Aplicativo da Web** e, em **Origens JavaScript autorizadas**, coloque `https://axtanso.github.io`. Crie e copie o **ID do cliente**.
5. Na VEGA: **Ajustes → Contas**, cole o ID e toque em **Conectar Google**. O Google avisa que o app não é verificado: toque em **Avançado → Acessar VEGA**. É o seu próprio app.

O acesso do Google dura 1 hora e se renova sozinho no próximo toque na tela.

## Conectar Outlook (uma vez só)

1. Abra [entra.microsoft.com](https://entra.microsoft.com) com a sua conta Microsoft e vá em **Registros de aplicativo → Novo registro**.
2. Nome **VEGA**. Em tipos de conta, escolha **contas em qualquer diretório organizacional e contas pessoais da Microsoft**.
3. Em **URI de redirecionamento**, escolha **Aplicativo de página única (SPA)** e coloque `https://axtanso.github.io/vega-assistente/`. Clique em **Registrar**.
4. Copie o **ID do aplicativo (cliente)**.
5. Na VEGA: **Ajustes → Contas**, cole o ID e toque em **Conectar Outlook**.

## Privacidade das contas

A VEGA só lê e-mails e cria eventos quando você pede. Para a IA vão apenas remetente, assunto e um trecho de até 160 caracteres de cada e-mail. Ela não envia nem apaga e-mails, e o acesso fica salvo só no aparelho. Para revogar: Google em [myaccount.google.com/permissions](https://myaccount.google.com/permissions) e Microsoft em [account.live.com/consent/Manage](https://account.live.com/consent/Manage).
