import {
  BRANCH,
  base64ToUtf8,
  checkPassword,
  githubApi,
  isAllowedPath,
  jsonResponse,
  utf8ToBase64,
} from "../../functions-lib/admin-shared.js";

const MAX_ITEMS = 100;

// Rebuilds the file by slicing around the matched front matter block instead
// of using String.replace(original, ...) on the whole file: the replacement
// argument there would interpret "$&", "$1", etc. if the untouched body
// (e.g. a product description with "R$ 5,00") happened to contain them.
function setAtivoField(content, ativo) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Front matter não encontrado");
  }
  const frontMatter = match[1];
  const value = ativo ? "true" : "false";
  const newFrontMatter = /^ativo\s*:.*$/m.test(frontMatter)
    ? frontMatter.replace(/^ativo\s*:.*$/m, `ativo: ${value}`)
    : `${frontMatter}\nativo: ${value}`;

  const newBlock = `---\n${newFrontMatter}\n---`;
  return content.slice(0, match.index) + newBlock + content.slice(match.index + match[0].length);
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

  try {
    const getRes = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
    if (!getRes.ok) {
      return { path, ok: false, error: `Não foi possível ler o arquivo (status ${getRes.status})` };
    }
    const fileData = await getRes.json();
    const currentContent = base64ToUtf8(fileData.content);
    const newContent = setAtivoField(currentContent, ativo);

    if (newContent === currentContent) {
      return { path, ok: true, unchanged: true };
    }

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Painel admin: define ativo=${ativo} em ${path}`,
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
