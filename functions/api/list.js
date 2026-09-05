import {
  ALLOWED_DIRS,
  BRANCH,
  checkPassword,
  extractField,
  getFrontMatter,
  githubApi,
  jsonResponse,
  base64ToUtf8,
} from "../../functions-lib/admin-shared.js";

async function listDir(env, dir) {
  const res = await githubApi(env, `contents/${dir}?ref=${BRANCH}`);
  if (!res.ok) {
    throw new Error(`Não foi possível listar ${dir} (status ${res.status})`);
  }
  const entries = await res.json();
  const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".md") && e.name !== "_index.md");

  const items = [];
  for (const file of files) {
    const fileRes = await githubApi(env, `contents/${file.path}?ref=${BRANCH}`);
    if (!fileRes.ok) continue;
    const fileData = await fileRes.json();
    const content = base64ToUtf8(fileData.content);
    const fm = getFrontMatter(content);
    if (fm === null) continue;
    items.push({
      path: file.path,
      title: extractField(fm, "title") || file.path,
      ativo: extractField(fm, "ativo") === "true",
      categoria: extractField(fm, "categoria"),
      codigo: extractField(fm, "codigo"),
      estoque: extractField(fm, "estoque"),
      preco: extractField(fm, "preco"),
      em_promocao: extractField(fm, "em_promocao") === "true",
      preco_promocional: extractField(fm, "preco_promocional"),
      exposicao: extractField(fm, "exposicao") === "true",
    });
  }
  return items;
}

export async function onRequestGet(context) {
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

  try {
    const [produtos, categorias] = await Promise.all([
      listDir(env, ALLOWED_DIRS[0]),
      listDir(env, ALLOWED_DIRS[1]),
    ]);
    return jsonResponse({ produtos, categorias });
  } catch (err) {
    return jsonResponse({ error: "Falha ao carregar dados do GitHub" }, 502);
  }
}

export async function onRequestPost() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
