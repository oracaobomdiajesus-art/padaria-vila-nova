import { checkPassword, exportarCatalogoParaSheet, jsonResponse } from "../../functions-lib/admin-shared.js";

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

// Gera a planilha a partir do catálogo atual no GitHub e grava no Google
// Sheets. Não recebe mais as linhas prontas do navegador: o servidor busca
// o catálogo e monta a planilha sozinho, para que este mesmo caminho possa
// ser reaproveitado pelo webhook de sincronização automática.
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

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
    return jsonResponse(
      {
        error:
          "Escrita na planilha não configurada. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY e GOOGLE_SHEET_ID nas variáveis de ambiente do Cloudflare Pages.",
      },
      500
    );
  }

  try {
    const resultado = await exportarCatalogoParaSheet(env);
    if (!resultado.ok) {
      return jsonResponse({ error: resultado.error }, 502);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro ao gravar na planilha" }, 502);
  }
}
