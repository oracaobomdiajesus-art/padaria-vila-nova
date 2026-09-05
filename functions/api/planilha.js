import { checkPassword, getGoogleAccessToken, jsonResponse } from "../../functions-lib/admin-shared.js";

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

export async function onRequestPost(context) {
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

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
    return jsonResponse(
      {
        error:
          "Escrita na planilha não configurada. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY e GOOGLE_SHEET_ID nas variáveis de ambiente do Cloudflare Pages.",
      },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const linhas = body && body.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return jsonResponse({ error: "Nenhuma linha para exportar" }, 400);
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values`;

    // Limpa a aba inteira antes de escrever, para não sobrar linha antiga de
    // um produto removido do catálogo.
    const clearRes = await fetch(`${sheetsUrl}/A1:Z10000:clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!clearRes.ok) {
      return jsonResponse({ error: `Não foi possível limpar a planilha (status ${clearRes.status})` }, 502);
    }

    const updateRes = await fetch(`${sheetsUrl}/A1?valueInputOption=RAW`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: linhas }),
    });

    if (!updateRes.ok) {
      return jsonResponse({ error: `Não foi possível gravar na planilha (status ${updateRes.status})` }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || "Erro ao gravar na planilha" }, 502);
  }
}
