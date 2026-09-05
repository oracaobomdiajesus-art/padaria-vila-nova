// Shared helpers for the admin panel's Pages Functions (list.js / toggle.js).
// Never log or return env.GITHUB_TOKEN or env.ADMIN_PASSWORD in any response.

export const OWNER = "oracaobomdiajesus-art";
export const REPO = "padaria-vila-nova";
export const BRANCH = "main";
export const ALLOWED_DIRS = ["content/produtos", "content/categorias"];
export const CATEGORIA_MIX_PATH = "content/categorias/mix.md";
export const CATEGORIA_MIX_TITLE = "Mix";
export const MARCADOR_CATEGORIAS_PLANILHA = "#CATEGORIAS_DISPONIVEIS";

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export function checkPassword(request, env) {
  const sent = request.headers.get("X-Admin-Password") || "";
  return Boolean(env.ADMIN_PASSWORD) && timingSafeEqual(sent, env.ADMIN_PASSWORD);
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function slugify(texto) {
  return (texto || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isAllowedPath(path) {
  if (typeof path !== "string" || path.includes("..")) return false;
  return ALLOWED_DIRS.some((dir) => path.startsWith(`${dir}/`)) && path.endsWith(".md") && !path.endsWith("_index.md");
}

export function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export async function githubApi(env, path, options = {}) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "padaria-vila-nova-admin-panel",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}

// Extracts a simple top-level "field: value" line from YAML front matter,
// stripping surrounding quotes. Good enough for the flat fields this site uses.
export function extractField(frontMatter, field) {
  const m = frontMatter.match(new RegExp(`^${field}\\s*:\\s*(.*)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

export function getFrontMatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

// Rebuilds the file by slicing around the matched front matter block instead
// of using String.replace(wholeFile, ...): the replacement argument there
// would interpret "$&", "$1", etc. if the untouched body (e.g. a product
// description with "R$ 5,00") happened to contain them.
export function setFrontMatterField(content, field, value) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("Front matter não encontrado");
  }
  const frontMatter = match[1];
  const fieldRegex = new RegExp(`^${field}\\s*:.*$`, "m");
  const newFrontMatter = fieldRegex.test(frontMatter)
    ? frontMatter.replace(fieldRegex, `${field}: ${value}`)
    : `${frontMatter}\n${field}: ${value}`;

  const newBlock = `---\n${newFrontMatter}\n---`;
  return content.slice(0, match.index) + newBlock + content.slice(match.index + match[0].length);
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(str) {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}

// Service account keys are usually pasted either with real newlines or with
// literal "\n" escape sequences (depending on how the value was copied from
// the downloaded JSON), so both forms are normalized before decoding.
function pemToDerBytes(pem) {
  const cleaned = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Exchanges a Google service account key for a short-lived OAuth access
// token (JWT bearer flow), used to write to the Sheets API on the owner's
// behalf without ever exposing a long-lived credential to the browser.
export async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDerBytes(env.GOOGLE_SERVICE_ACCOUNT_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`Falha ao autenticar com o Google (status ${res.status})`);
  }

  const data = await res.json();
  return data.access_token;
}

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

// Busca o catálogo completo (produtos + categorias) do GitHub. Usado tanto
// por /api/list quanto por qualquer rotina que precise gerar a planilha
// (exportação manual e o webhook de sincronização automática).
export async function getCatalogo(env) {
  const [produtos, categorias] = await Promise.all([
    listDir(env, ALLOWED_DIRS[0]),
    listDir(env, ALLOWED_DIRS[1]),
  ]);
  return { produtos, categorias };
}

// Monta as linhas da planilha a partir do catálogo, incluindo a legenda de
// categorias existentes no final (ignorada na importação, ver o marcador
// MARCADOR_CATEGORIAS_PLANILHA) e um aviso de quando a última sincronização
// automática aconteceu, na própria linha de cabeçalho.
export function montarLinhasPlanilha(produtos, categorias) {
  const cabecalho = [
    "Caminho (não editar)",
    "Categoria",
    "Produto",
    "Codigo",
    "Preco",
    "EmPromocao",
    "PrecoPromocional",
    "Estoque",
    "Ativo",
    "Exposicao",
  ];

  let agora;
  try {
    agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    agora = new Date().toISOString();
  }

  const linhas = [[...cabecalho, `Última sincronização automática: ${agora}`]];

  produtos
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((p) => {
      linhas.push([
        p.path,
        p.categoria || "",
        p.title,
        p.codigo || "",
        p.preco || "",
        p.em_promocao ? "Sim" : "Nao",
        p.preco_promocional || "",
        p.estoque || "",
        p.ativo ? "Sim" : "Nao",
        p.exposicao ? "Sim" : "Nao",
      ]);
    });

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => c.title)
    .sort((a, b) => a.localeCompare(b));

  linhas.push([
    MARCADOR_CATEGORIAS_PLANILHA,
    "Categorias existentes — use exatamente um destes nomes na coluna Categoria:",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  categoriasAtivas.forEach((nomeCat) => {
    linhas.push(["", nomeCat, "", "", "", "", "", "", "", ""]);
  });
  linhas.push([
    "",
    `Categoria não reconhecida vira automaticamente "${CATEGORIA_MIX_TITLE}" ao importar.`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return linhas;
}

// Gera a planilha a partir do catálogo atual e grava no Google Sheets
// configurado. Usado pelo botão manual "Exportar para o Google Sheets" e
// pelo webhook que sincroniza automaticamente a cada alteração no GitHub.
export async function exportarCatalogoParaSheet(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
    return { ok: false, error: "Escrita na planilha não configurada" };
  }

  const { produtos, categorias } = await getCatalogo(env);
  const linhas = montarLinhasPlanilha(produtos, categorias);

  const accessToken = await getGoogleAccessToken(env);
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values`;

  // Limpa a aba inteira antes de escrever, para não sobrar linha antiga de
  // um produto removido do catálogo.
  const clearRes = await fetch(`${sheetsUrl}/A1:Z10000:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!clearRes.ok) {
    return { ok: false, error: `Não foi possível limpar a planilha (status ${clearRes.status})` };
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
    return { ok: false, error: `Não foi possível gravar na planilha (status ${updateRes.status})` };
  }

  return { ok: true };
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Verifica a assinatura HMAC-SHA256 que o GitHub envia no cabeçalho
// "X-Hub-Signature-256" de cada webhook, provando que a chamada veio
// mesmo do GitHub (e não de alguém forjando um POST para essa URL) e não
// foi alterada em trânsito.
export async function verificarAssinaturaGithub(secret, rawBody, assinaturaRecebida) {
  if (!secret || !assinaturaRecebida || !assinaturaRecebida.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const esperada = `sha256=${bytesToHex(new Uint8Array(signature))}`;
  return timingSafeEqual(esperada, assinaturaRecebida);
}
