import { checkPassword, getCatalogo, jsonResponse } from "../../functions-lib/admin-shared.js";

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
    const { produtos, categorias } = await getCatalogo(env);
    return jsonResponse({ produtos, categorias });
  } catch (err) {
    return jsonResponse({ error: "Falha ao carregar dados do GitHub" }, 502);
  }
}

export async function onRequestPost() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
