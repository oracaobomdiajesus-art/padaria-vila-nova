import { BRANCH, base64ToUtf8, extractField, getFrontMatter, githubApi, jsonResponse } from "../../functions-lib/admin-shared.js";

// Endpoint público (sem senha) chamado direto pelo carrinho do site — quem
// visita a loja não tem senha do painel admin. Por isso NUNCA confia no
// preço que vem do navegador: o carrinho manda só slug + quantidade, e o
// preço de cada item é sempre buscado de novo aqui, direto do catálogo no
// GitHub, exatamente como está publicado agora.
const MAX_ITENS = 50;

async function buscarProdutoPorSlug(env, slug) {
  if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) return null;

  const path = `content/produtos/${slug}.md`;
  const res = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
  if (!res.ok) return null;

  const fileData = await res.json();
  const content = base64ToUtf8(fileData.content);
  const fm = getFrontMatter(content);
  if (fm === null) return null;

  const ativo = extractField(fm, "ativo") === "true";
  if (!ativo) return null;

  const title = extractField(fm, "title") || slug;
  const emPromocao = extractField(fm, "em_promocao") === "true";
  const precoPromocional = extractField(fm, "preco_promocional");
  const precoNormal = extractField(fm, "preco");

  const precoEfetivo = emPromocao && precoPromocional ? Number(precoPromocional) : Number(precoNormal);
  if (!isFinite(precoEfetivo) || precoEfetivo <= 0) return null;

  return { title, preco: precoEfetivo };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Pagamento online não configurado" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const itensRecebidos = Array.isArray(body && body.itens) ? body.itens : [];
  if (itensRecebidos.length === 0) {
    return jsonResponse({ error: "Carrinho vazio" }, 400);
  }
  if (itensRecebidos.length > MAX_ITENS) {
    return jsonResponse({ error: "Carrinho com itens demais" }, 400);
  }

  const itensPreferencia = [];
  for (const item of itensRecebidos) {
    const slug = item && item.slug;
    const qty = item && Number(item.qty);
    if (!slug || !isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return jsonResponse({ error: `Item inválido no carrinho` }, 400);
    }

    const produto = await buscarProdutoPorSlug(env, slug);
    if (!produto) {
      return jsonResponse({ error: `Produto indisponível: ${slug}. Atualize a página e tente de novo.` }, 400);
    }

    itensPreferencia.push({
      title: produto.title,
      quantity: qty,
      unit_price: produto.preco,
      currency_id: "BRL",
    });
  }

  const origem = new URL(request.url).origin;

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: itensPreferencia,
        back_urls: {
          success: `${origem}/pagamento/sucesso/`,
          pending: `${origem}/pagamento/pendente/`,
          failure: `${origem}/pagamento/erro/`,
        },
        auto_return: "approved",
        // "ticket" é o tipo de pagamento do boleto no Mercado Pago — exclui
        // ele porque não faz sentido pra uma compra pequena numa padaria
        // (o comprador teria que esperar o boleto compensar pra retirar).
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
        },
      }),
    });

    if (!mpRes.ok) {
      const detalhe = await mpRes.text();
      console.error("Mercado Pago rejeitou a preferência:", mpRes.status, detalhe);
      return jsonResponse({ error: `Não foi possível iniciar o pagamento (status ${mpRes.status})` }, 502);
    }

    const preferencia = await mpRes.json();
    return jsonResponse({ init_point: preferencia.init_point });
  } catch (err) {
    return jsonResponse({ error: "Erro ao conectar com o Mercado Pago" }, 502);
  }
}

export async function onRequestGet() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
