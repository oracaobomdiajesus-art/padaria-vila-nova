import {
  ALLOWED_DIRS,
  BRANCH,
  exportarCatalogoParaSheet,
  jsonResponse,
  verificarAssinaturaGithub,
} from "../../functions-lib/admin-shared.js";

// Recebe o webhook de "push" que o GitHub envia a cada commit no repositório
// (configurado manualmente nas configurações do repositório). Sempre que um
// commit alterar produtos ou categorias — seja pelo Pages CMS, pelo painel
// admin ou por um push manual — a planilha do Google Sheets é atualizada
// sozinha, sem precisar do botão "Exportar para o Google Sheets".
function tocaArquivosPermitidos(commits) {
  for (const commit of commits || []) {
    const arquivos = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
    if (arquivos.some((f) => ALLOWED_DIRS.some((dir) => f.startsWith(`${dir}/`)))) {
      return true;
    }
  }
  return false;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GITHUB_WEBHOOK_SECRET) {
    // Sem segredo configurado, não dá para confirmar que a chamada veio do
    // GitHub — melhor recusar do que aceitar qualquer POST sem verificação.
    return jsonResponse({ error: "Webhook não configurado" }, 500);
  }

  const rawBody = await request.text();
  const assinatura = request.headers.get("X-Hub-Signature-256") || "";
  const valido = await verificarAssinaturaGithub(env.GITHUB_WEBHOOK_SECRET, rawBody, assinatura);
  if (!valido) {
    return jsonResponse({ error: "Assinatura inválida" }, 401);
  }

  const evento = request.headers.get("X-GitHub-Event") || "";
  if (evento === "ping") {
    return jsonResponse({ ok: true, mensagem: "pong" });
  }
  if (evento !== "push") {
    return jsonResponse({ ok: true, ignorado: `evento '${evento}' não tratado` });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (payload.ref !== `refs/heads/${BRANCH}`) {
    return jsonResponse({ ok: true, ignorado: `push fora da branch ${BRANCH}` });
  }

  if (!tocaArquivosPermitidos(payload.commits)) {
    return jsonResponse({ ok: true, ignorado: "nenhum produto ou categoria alterado" });
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
    // Integração com Sheets ainda não configurada — não é um erro do webhook.
    return jsonResponse({ ok: true, ignorado: "planilha do Google Sheets não configurada" });
  }

  try {
    const resultado = await exportarCatalogoParaSheet(env);
    if (!resultado.ok) {
      return jsonResponse({ ok: false, error: resultado.error }, 502);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || "Erro ao sincronizar planilha" }, 502);
  }
}

export async function onRequestGet() {
  return jsonResponse({ error: "Método não permitido" }, 405);
}
