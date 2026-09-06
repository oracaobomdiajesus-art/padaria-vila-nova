# Pagamento online (Mercado Pago) — opcional

Este site tem três formas de fechar pedido, lado a lado no carrinho:

1. **Pagar online (Mercado Pago)** — pagamento automático, confirmado na hora.
2. **Enviar pedido pelo WhatsApp** — fluxo manual original.
3. **Já paguei via Pix — enviar pedido** — confirmação manual original.

As duas últimas continuam existindo sem nenhuma mudança. A primeira é **opcional**:
se `MERCADOPAGO_ACCESS_TOKEN` não estiver configurado, o botão continua aparecendo
mas retorna erro ao clicar — o esperado é combinar com o cliente antes de ativar.

## Como funciona

1. O botão "Pagar online" manda pro servidor só `slug` e `quantidade` de cada
   item do carrinho — **nunca o preço**. O preço de cada item é sempre
   recalculado no servidor a partir do arquivo do produto no GitHub (o mesmo
   catálogo que já alimenta o site), pra ninguém conseguir pagar um valor
   diferente do real mexendo no navegador.
2. O servidor (`functions/api/pagamento.js`) cria uma "preferência de
   pagamento" na API do Mercado Pago (Checkout Pro) e devolve o link de
   pagamento deles (`init_point`).
3. O navegador do cliente é redirecionado pra esse link — a página de
   pagamento é do próprio Mercado Pago; o número do cartão nunca passa pelo
   nosso código.
4. Depois de pagar, o Mercado Pago redireciona de volta pra uma destas
   páginas (`static/pagamento/…`), dependendo do resultado:
   - `/pagamento/sucesso/` — aprovado (limpa o carrinho salvo no navegador)
   - `/pagamento/pendente/` — em análise (ex.: boleto, Pix ainda não caiu)
   - `/pagamento/erro/` — recusado ou cancelado (carrinho continua salvo)

Não existe confirmação automática por *webhook* nesta versão — quem
administra a padaria confere os pedidos pagos direto no painel do Mercado
Pago. Isso é suficiente pra um catálogo pequeno; um webhook (`IPN`/
`notification_url`) seria o próximo passo natural se o volume de pedidos
crescer e for necessário baixar estoque automaticamente a cada venda.

## Como ativar (ou trocar de conta, em outro projeto)

1. Criar/entrar numa conta Mercado Pago → **Seu negócio → Configurações →
   Credenciais** (ou `mercadopago.com.br/developers/panel`).
2. Copiar o **Access Token** — usar o de **teste** (`TEST-...`) primeiro pra
   validar o fluxo sem dinheiro de verdade; trocar pelo de **produção**
   (`APP_USR-...`) depois, no mesmo lugar.
3. No Cloudflare Pages do projeto: **Settings → Variables and secrets** →
   adicionar `MERCADOPAGO_ACCESS_TOKEN` como **segredo** (não variável
   comum) com esse valor.
4. Fazer um redeploy (mesmo truque de sempre: um commit trivial, ex. em
   `wrangler.toml`) pra a variável nova ser carregada.

## Reaproveitando em outro projeto (cliente novo)

O arquivo `functions/api/pagamento.js` já é genérico — só depende de:
- `env.MERCADOPAGO_ACCESS_TOKEN` (a conta de quem recebe o dinheiro)
- `env.GITHUB_TOKEN` (já existe nos outros projetos que seguem este mesmo
  padrão) pra ler o preço atual de cada produto

Copiando esse arquivo, o partial `layouts/partials/cart-panel.html`, o botão
em `static/js/cart.js` (`setupPagamentoOnline`) e as três páginas de
`static/pagamento/`, a integração funciona em qualquer site que siga a
mesma estrutura de `content/produtos/*.md` (campos `preco`, `preco_promocional`,
`em_promocao`, `ativo`, `title`, `slug`).
