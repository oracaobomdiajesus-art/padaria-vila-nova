import {
  BRANCH,
  base64ToUtf8,
  checkPassword,
  githubApi,
  isAllowedPath,
  jsonResponse,
  setFrontMatterField,
  utf8ToBase64,
} from "../../functions-lib/admin-shared.js";

const MAX_ITEMS = 100;

function parseEstoque(path, estoqueRaw) {
  if (!path.startsWith("content/produtos/")) return { estoque: null };
  if (estoqueRaw === undefined || estoqueRaw === null || estoqueRaw === "") return { estoque: null };
  const n = Number(String(estoqueRaw).trim().replace(",", "."));
  if (!Number.isInteger(n) || n < 0) return { error: "Valor de 'estoque' inválido" };
  return { estoque: n };
}

function parsePreco(path, precoRaw) {
  if (!path.startsWith("content/produtos/")) return { preco: null };
  if (precoRaw === undefined || precoRaw === null || precoRaw === "") return { preco: null };
  const n = Number(String(precoRaw).trim().replace(",", "."));
  if (!isFinite(n) || n < 0) return { error: "Valor de 'preco' inválido" };
  return { preco: n };
}

async function toggleOne(env, item) {
  const path = item && item.path;
  const ativo = item && item.ativo;

  if (!isAllowedPath(path)) {
    return { path: path || "(desconhecido)", ok: false, error: "Caminho não permitido" };
  }
  if (typeof ativo !== "boolean") {
    return { path, ok: false, error: "Valor de 'ativo' inválido" };
  }

  const { estoque, error: estoqueError } = parseEstoque(path, item && item.estoque);
  if (estoqueError) {
    return { path, ok: false, error: estoqueError };
  }

  const { preco, error: precoError } = parsePreco(path, item && item.preco);
  if (precoError) {
    return { path, ok: false, error: precoError };
  }

  const emPromocao =
    path.startsWith("content/produtos/") && typeof (item && item.em_promocao) === "boolean"
      ? item.em_promocao
      : null;

  try {
    const getRes = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
    if (!getRes.ok) {
      return { path, ok: false, error: `Não foi possível ler o arquivo (status ${getRes.status})` };
    }
    const fileData = await getRes.json();
    const currentContent = base64ToUtf8(fileData.content);

    let newContent = setFrontMatterField(currentContent, "ativo", ativo ? "true" : "false");
    if (estoque !== null) {
      newContent = setFrontMatterField(newContent, "estoque", String(estoque));
    }
    if (preco !== null) {
      newContent = setFrontMatterField(newContent, "preco", String(preco));
    }
    if (emPromocao !== null) {
      newContent = setFrontMatterField(newContent, "em_promocao", emPromocao ? "true" : "false");
    }

    if (newContent === currentContent) {
      return { path, ok: true, unchanged: true };
    }

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Painel admin: atualiza ${path}`,
        content: utf8ToBase64(newContent),
        sha: fileData.sha,
        branch: BRANCH,
      }),
    });

    if (!putRes.ok) {
      return { path, ok: false, error: `Falha ao salvar no GitHub (status ${putRes.status})` };
    }

    return { path, ok: true };
  } catch (err) {
    return { path, ok: false, error: "Erro inesperado ao processar este item" };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) {
    return jsonResponse(
      { error: "Servidor não configurado. Defina ADMIN_PASSWORD e GITHUB_TOKEN nas variáveis de ambiente do Cloudflare Pages." },
      500
    );
  }

  if (!checkPassword(request, env)) {
    return jsonResponse({ error: "Senha incorreta" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const items = body && body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse({ error: "Nenhum item enviado" }, 400);
  }
  if (items.length > MAX_ITEMS) {
    return jsonResponse({ error: "Muitos itens em uma única requisição" }, 400);
  }

  const results = [];
  for (const item of items) {
    results.push(await toggleOne(env, item));
  }

  return jsonResponse({ results });
}

export async function onRequestGet() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
