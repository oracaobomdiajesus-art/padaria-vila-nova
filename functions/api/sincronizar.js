import {
  BRANCH,
  base64ToUtf8,
  checkPassword,
  githubApi,
  isAllowedPath,
  jsonResponse,
  setFrontMatterField,
  slugify,
  utf8ToBase64,
} from "../../functions-lib/admin-shared.js";

const MAX_ITEMS = 200;
const CAMPOS_TEXTO = ["categoria", "codigo"];
const CAMPOS_NUMERO = ["preco", "estoque", "preco_promocional"];
const CAMPOS_BOOLEANO = ["em_promocao", "ativo", "exposicao"];

function validarNumero(valor) {
  if (valor === undefined || valor === null || valor === "") return { ok: true, valor: null };
  const n = Number(valor);
  if (!isFinite(n) || n < 0) return { ok: false };
  return { ok: true, valor: n };
}

async function atualizarProduto(env, item) {
  const path = item && item.path;
  if (!isAllowedPath(path) || !path.startsWith("content/produtos/")) {
    return { path: path || "(desconhecido)", ok: false, error: "Caminho não permitido" };
  }

  try {
    const getRes = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
    if (!getRes.ok) {
      return { path, ok: false, error: `Não foi possível ler o arquivo (status ${getRes.status})` };
    }
    const fileData = await getRes.json();
    let content = base64ToUtf8(fileData.content);
    const original = content;

    if (typeof item.title === "string" && item.title.trim()) {
      content = setFrontMatterField(content, "title", item.title.trim());
    }
    for (const campo of CAMPOS_TEXTO) {
      if (typeof item[campo] === "string" && item[campo].trim()) {
        content = setFrontMatterField(content, campo, JSON.stringify(item[campo].trim()));
      }
    }
    for (const campo of CAMPOS_NUMERO) {
      if (item[campo] !== undefined && item[campo] !== null && item[campo] !== "") {
        const { ok, valor } = validarNumero(item[campo]);
        if (!ok) return { path, ok: false, error: `Valor inválido para '${campo}'` };
        content = setFrontMatterField(content, campo, String(valor));
      }
    }
    for (const campo of CAMPOS_BOOLEANO) {
      if (typeof item[campo] === "boolean") {
        content = setFrontMatterField(content, campo, item[campo] ? "true" : "false");
      }
    }

    if (content === original) {
      return { path, ok: true, unchanged: true };
    }

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Sincronização da planilha: atualiza ${path}`,
        content: utf8ToBase64(content),
        sha: fileData.sha,
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      return { path, ok: false, error: `Falha ao salvar no GitHub (status ${putRes.status})` };
    }
    return { path, ok: true };
  } catch (err) {
    return { path, ok: false, error: "Erro inesperado ao atualizar este item" };
  }
}

async function arquivoExiste(env, path) {
  const res = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
  return res.ok;
}

async function gerarSlugUnico(env, titulo) {
  const base = slugify(titulo) || "produto";
  let slug = base;
  let sufixo = 2;
  while (await arquivoExiste(env, `content/produtos/${slug}.md`)) {
    slug = `${base}-${sufixo}`;
    sufixo += 1;
    if (sufixo > 50) break;
  }
  return slug;
}

async function criarProduto(env, item) {
  const titulo = typeof item.title === "string" ? item.title.trim() : "";
  const categoria = typeof item.categoria === "string" ? item.categoria.trim() : "";

  if (!titulo) return { path: "(novo produto)", ok: false, error: "Nome do produto é obrigatório" };
  if (!categoria) return { path: titulo, ok: false, error: "Categoria é obrigatória" };

  const { ok: precoOk, valor: preco } = validarNumero(item.preco);
  if (!precoOk || preco === null) {
    return { path: titulo, ok: false, error: "Preço é obrigatório e precisa ser um número válido" };
  }

  const { ok: estoqueOk, valor: estoque } = validarNumero(item.estoque);
  if (!estoqueOk) return { path: titulo, ok: false, error: "Valor de estoque inválido" };

  const { ok: precoPromoOk, valor: precoPromocional } = validarNumero(item.preco_promocional);
  if (!precoPromoOk) return { path: titulo, ok: false, error: "Valor de preço promocional inválido" };

  try {
    const slug = await gerarSlugUnico(env, titulo);
    const path = `content/produtos/${slug}.md`;

    const linhas = [
      `slug: ${JSON.stringify(slug)}`,
      `title: ${JSON.stringify(titulo)}`,
      `preco: ${preco}`,
    ];
    if (item.codigo) linhas.push(`codigo: ${JSON.stringify(String(item.codigo).trim())}`);
    linhas.push(`em_promocao: ${item.em_promocao ? "true" : "false"}`);
    if (precoPromocional !== null) linhas.push(`preco_promocional: ${precoPromocional}`);
    linhas.push(`categoria: ${JSON.stringify(categoria)}`);
    if (estoque !== null) linhas.push(`estoque: ${estoque}`);
    linhas.push(`ativo: ${item.ativo === false ? "false" : "true"}`);
    linhas.push(`exposicao: ${item.exposicao ? "true" : "false"}`);
    linhas.push("peso: 100");
    linhas.push("_build:");
    linhas.push("  render: never");
    linhas.push("  list: local");

    const content = `---\n${linhas.join("\n")}\n---\n`;

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Sincronização da planilha: cria ${path}`,
        content: utf8ToBase64(content),
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      return { path, ok: false, error: `Falha ao criar no GitHub (status ${putRes.status})` };
    }
    return { path, ok: true, criado: true };
  } catch (err) {
    return { path: titulo, ok: false, error: "Erro inesperado ao criar este produto" };
  }
}

async function desativarProduto(env, path) {
  if (!isAllowedPath(path) || !path.startsWith("content/produtos/")) {
    return { path: path || "(desconhecido)", ok: false, error: "Caminho não permitido" };
  }
  try {
    const getRes = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
    if (!getRes.ok) {
      return { path, ok: false, error: `Não foi possível ler o arquivo (status ${getRes.status})` };
    }
    const fileData = await getRes.json();
    const currentContent = base64ToUtf8(fileData.content);
    const newContent = setFrontMatterField(currentContent, "ativo", "false");

    if (newContent === currentContent) {
      return { path, ok: true, unchanged: true };
    }

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Sincronização da planilha: desativa ${path} (ausente na planilha)`,
        content: utf8ToBase64(newContent),
        sha: fileData.sha,
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      return { path, ok: false, error: `Falha ao desativar (status ${putRes.status})` };
    }
    return { path, ok: true, desativado: true };
  } catch (err) {
    return { path, ok: false, error: "Erro inesperado ao desativar este item" };
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

  const atualizacoes = Array.isArray(body && body.atualizacoes) ? body.atualizacoes : [];
  const criacoes = Array.isArray(body && body.criacoes) ? body.criacoes : [];
  const desativacoes = Array.isArray(body && body.desativacoes) ? body.desativacoes : [];

  const total = atualizacoes.length + criacoes.length + desativacoes.length;
  if (total === 0) {
    return jsonResponse({ error: "Nenhuma alteração para sincronizar" }, 400);
  }
  if (total > MAX_ITEMS) {
    return jsonResponse({ error: "Muitas alterações em uma única sincronização" }, 400);
  }

  const resultados = [];
  for (const item of atualizacoes) {
    resultados.push(await atualizarProduto(env, item));
  }
  for (const item of criacoes) {
    resultados.push(await criarProduto(env, item));
  }
  for (const path of desativacoes) {
    resultados.push(await desativarProduto(env, path));
  }

  return jsonResponse({ resultados });
}

export async function onRequestGet() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
