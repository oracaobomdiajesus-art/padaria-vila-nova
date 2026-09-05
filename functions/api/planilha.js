import { checkPassword, jsonResponse } from "../../functions-lib/admin-shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.ADMIN_PASSWORD) {
    return jsonResponse(
      { error: "Servidor não configurado. Defina ADMIN_PASSWORD nas variáveis de ambiente do Cloudflare Pages." },
      500
    );
  }

  if (!checkPassword(request, env)) {
    return jsonResponse({ error: "Senha incorreta" }, 401);
  }

  if (!env.SHEET_CSV_URL) {
    return jsonResponse(
      { error: "Nenhuma planilha configurada. Defina SHEET_CSV_URL nas variáveis de ambiente do Cloudflare Pages." },
      500
    );
  }

  try {
    const res = await fetch(env.SHEET_CSV_URL);
    if (!res.ok) {
      return jsonResponse({ error: `Não foi possível acessar a planilha (status ${res.status})` }, 502);
    }
    const csv = await res.text();
    return jsonResponse({ csv });
  } catch (err) {
    return jsonResponse({ error: "Erro ao buscar a planilha" }, 502);
  }
}

export async function onRequestPost() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
