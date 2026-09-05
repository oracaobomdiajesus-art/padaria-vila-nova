import { ALLOWED_DIRS, BRANCH, checkPassword, githubApi, jsonResponse } from "../../functions-lib/admin-shared.js";

const MAX_COMMITS = 25;

async function commitsForPath(env, path) {
  const res = await githubApi(env, `commits?sha=${BRANCH}&path=${encodeURIComponent(path)}&per_page=30`);
  if (!res.ok) {
    throw new Error(`status ${res.status}`);
  }
  return res.json();
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
    const listas = await Promise.all(ALLOWED_DIRS.map((dir) => commitsForPath(env, dir)));
    const porSha = new Map();
    listas.flat().forEach((c) => porSha.set(c.sha, c));

    const historico = Array.from(porSha.values())
      .sort((a, b) => new Date(b.commit.author.date) - new Date(a.commit.author.date))
      .slice(0, MAX_COMMITS)
      .map((c) => ({
        sha: c.sha,
        mensagem: c.commit.message.split("\n")[0],
        data: c.commit.author.date,
      }));

    return jsonResponse({ historico });
  } catch (err) {
    return jsonResponse({ error: "Erro ao carregar histórico do GitHub" }, 502);
  }
}

// Reverte apenas o efeito do commit escolhido: para cada arquivo de produto/
// categoria alterado nele, restaura o conteúdo de como estava no commit
// anterior (ou remove o arquivo, se ele tiver sido criado por esse commit).
//
// Isso restaura o arquivo inteiro para o estado de antes do commit, não só
// a mudança específica dele — então, se o mesmo arquivo tiver sido alterado
// de novo depois (por outro commit), essa alteração mais recente também
// seria descartada. `arquivo.sha` é o blob que o commit escolhido deixou
// gravado; se o blob atual (HEAD) for diferente disso, é sinal de que houve
// alteração posterior — a restauração segue em frente (mesmo padrão de
// "faz e avisa" usado no resto do painel), mas o resultado é marcado para
// o painel exibir um aviso.
async function restaurarArquivo(env, arquivo, parentSha) {
  const path = arquivo.filename;
  try {
    if (arquivo.status === "added") {
      const currentRes = await githubApi(env, `contents/${path}?ref=${BRANCH}`);
      if (!currentRes.ok) {
        return { path, ok: true, unchanged: true };
      }
      const current = await currentRes.json();
      const alteradoDepois = Boolean(arquivo.sha && current.sha !== arquivo.sha);
      const delRes = await githubApi(env, `contents/${path}`, {
        method: "DELETE",
        body: JSON.stringify({
          message: `Restaurar versão anterior: remove ${path}`,
          sha: current.sha,
          branch: BRANCH,
        }),
      });
      if (!delRes.ok) {
        return { path, ok: false, error: `Falha ao remover (status ${delRes.status})` };
      }
      return { path, ok: true, acao: "removido", alteradoDepois };
    }

    const [oldRes, currentRes] = await Promise.all([
      githubApi(env, `contents/${path}?ref=${parentSha}`),
      githubApi(env, `contents/${path}?ref=${BRANCH}`),
    ]);

    if (!oldRes.ok) {
      return { path, ok: false, error: `Não encontrei a versão anterior desse arquivo (status ${oldRes.status})` };
    }
    const old = await oldRes.json();
    const current = currentRes.ok ? await currentRes.json() : null;
    const alteradoDepois = Boolean(arquivo.sha && current && current.sha !== arquivo.sha);

    const putRes = await githubApi(env, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Restaurar versão anterior de ${path}`,
        content: old.content,
        sha: current ? current.sha : undefined,
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      return { path, ok: false, error: `Falha ao restaurar (status ${putRes.status})` };
    }
    return { path, ok: true, acao: "restaurado", alteradoDepois };
  } catch (err) {
    return { path, ok: false, error: "Erro inesperado ao restaurar este arquivo" };
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

  const sha = body && body.sha;
  if (!sha || typeof sha !== "string") {
    return jsonResponse({ error: "Nenhuma versão informada" }, 400);
  }

  try {
    const commitRes = await githubApi(env, `commits/${sha}`);
    if (!commitRes.ok) {
      return jsonResponse({ error: `Não foi possível ler essa versão (status ${commitRes.status})` }, 502);
    }
    const commitData = await commitRes.json();
    const parentSha = commitData.parents && commitData.parents[0] && commitData.parents[0].sha;
    if (!parentSha) {
      return jsonResponse({ error: "Essa versão não tem um estado anterior para restaurar" }, 400);
    }

    const arquivos = (commitData.files || []).filter((f) =>
      ALLOWED_DIRS.some((dir) => f.filename.startsWith(`${dir}/`))
    );

    if (arquivos.length === 0) {
      return jsonResponse({ error: "Essa versão não alterou produtos ou categorias" }, 400);
    }

    const resultados = [];
    for (const arquivo of arquivos) {
      resultados.push(await restaurarArquivo(env, arquivo, parentSha));
    }

    return jsonResponse({ resultados });
  } catch (err) {
    return jsonResponse({ error: "Erro ao restaurar versão" }, 502);
  }
}
