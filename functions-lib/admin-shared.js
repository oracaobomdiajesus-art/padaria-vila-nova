// Shared helpers for the admin panel's Pages Functions (list.js / toggle.js).
// Never log or return env.GITHUB_TOKEN or env.ADMIN_PASSWORD in any response.

export const OWNER = "oracaobomdiajesus-art";
export const REPO = "padaria-vila-nova";
export const BRANCH = "main";
export const ALLOWED_DIRS = ["content/produtos", "content/categorias"];
export const CATEGORIA_MIX_PATH = "content/categorias/mix.md";
export const CATEGORIA_MIX_TITLE = "Mix";

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
      estoque_site: extractField(fm, "estoque_site"),
      foto: extractField(fm, "foto"),
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

// Índices de coluna (0-indexado) usados tanto para montar as linhas quanto
// para aplicar os menus suspensos (data validation) nelas.
const COLUNA_CATEGORIA = 1;
const COLUNA_EM_PROMOCAO = 6;
const COLUNA_ATIVO = 9;
const COLUNA_EXPOSICAO = 10;

// Base pra montar o link de cada foto na coluna "Imagem" da planilha. Fica
// como texto simples (não como fórmula =IMAGE()) — a função nativa do
// Sheets depende de um robô do Google buscar a imagem nos bastidores, e
// isso falhou tanto com o domínio do site quanto com este; o visualizador
// de fotos de verdade é o Apps Script (ImageViewerProdutos), que abre a
// foto no navegador da própria pessoa, contornando esse bloqueio.
const IMAGEM_BASE_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/static`;

// A lista de categorias existentes mora numa aba separada (não misturada
// com os produtos), criada e mantida automaticamente. Linha 1 é um título;
// a partir da linha 2 vem uma categoria por linha. O intervalo de origem do
// menu suspenso de Categoria é sempre esse (fixo, com folga), então não
// precisa recalcular a cada sincronização.
const CATEGORIAS_ABA_TITULO = "Categorias";
const CATEGORIAS_ABA_FONTE = { inicio: 2, fim: 1000 };

// Monta as linhas da aba principal (cabeçalho + produtos, sem nenhuma
// legenda misturada) e devolve em que linhas (1-indexado, como no Sheets)
// os produtos ficaram, pra dar pra aplicar os menus suspensos exatamente
// sobre eles.
export function montarLinhasPlanilha(produtos, categorias) {
  const cabecalho = [
    "Caminho (não editar)",
    "Categoria",
    "Produto",
    "Imagem",
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

  const produtosOrdenados = produtos.slice().sort((a, b) => a.title.localeCompare(b.title));
  produtosOrdenados.forEach((p) => {
    // Link de texto simples (não =IMAGE()): o =IMAGE() depende do robô do
    // Google conseguir buscar a imagem nos bastidores, e isso falhou tanto
    // com o link do site quanto com o do GitHub — sinal de que o problema é
    // do lado do robô, não do link em si. O visualizador de fotos de verdade
    // é o Apps Script (ver ImageViewerProdutos), que abre a foto no
    // navegador da própria pessoa, contornando esse bloqueio.
    const imagemUrl = p.foto ? `${IMAGEM_BASE_URL}${p.foto}` : "";
    linhas.push([
      p.path,
      p.categoria || "",
      p.title,
      imagemUrl,
      p.codigo || "",
      p.preco || "",
      p.em_promocao ? "Sim" : "Nao",
      p.preco_promocional || "",
      p.estoque || "",
      p.ativo ? "Sim" : "Nao",
      p.exposicao ? "Sim" : "Nao",
    ]);
  });
  const produtosRange = produtosOrdenados.length
    ? { inicio: 2, fim: linhas.length }
    : null;

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => c.title)
    .sort((a, b) => a.localeCompare(b));

  return { linhas, produtosRange, categoriasAtivas };
}

// Monta as linhas da aba "Categorias": um título, uma categoria por linha,
// e uma nota no final. Só existe pra servir de referência visual e de fonte
// do menu suspenso — não é lida na importação.
function montarLinhasAbaCategorias(categoriasAtivas) {
  const linhas = [["Categorias existentes — use exatamente um destes nomes na coluna Categoria da aba principal:"]];
  categoriasAtivas.forEach((nomeCat) => linhas.push([nomeCat]));
  linhas.push([`Categoria digitada na aba principal que não estiver nesta lista vira automaticamente "${CATEGORIA_MIX_TITLE}" ao importar.`]);
  return linhas;
}

function requisicaoValidacaoLista(sheetId, range, coluna, valores) {
  return {
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: range.inicio - 1,
        endRowIndex: range.fim,
        startColumnIndex: coluna,
        endColumnIndex: coluna + 1,
      },
      rule: {
        condition: { type: "ONE_OF_LIST", values: valores.map((v) => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: false,
      },
    },
  };
}

function requisicaoValidacaoCategoriaCruzada(sheetId, produtosRange) {
  return {
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: produtosRange.inicio - 1,
        endRowIndex: produtosRange.fim,
        startColumnIndex: COLUNA_CATEGORIA,
        endColumnIndex: COLUNA_CATEGORIA + 1,
      },
      rule: {
        condition: {
          type: "ONE_OF_RANGE",
          values: [
            {
              userEnteredValue: `=${CATEGORIAS_ABA_TITULO}!A${CATEGORIAS_ABA_FONTE.inicio}:A${CATEGORIAS_ABA_FONTE.fim}`,
            },
          ],
        },
        showCustomUi: true,
        strict: false,
      },
    },
  };
}

// Garante que a aba "Categorias" exista (cria se ainda não existir) e
// devolve o sheetId numérico da aba principal (a primeira da planilha),
// necessário pra apontar os menus suspensos pro lugar certo.
async function garantirAbaCategorias(env, accessToken) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    return { ok: false, error: `Não foi possível ler a estrutura da planilha (status ${metaRes.status})` };
  }
  const meta = await metaRes.json();
  const abas = (meta.sheets || []).map((s) => s.properties);
  const principal = abas[0];
  if (!principal) {
    return { ok: false, error: "Planilha sem nenhuma aba encontrada" };
  }

  const jaExiste = abas.some((a) => a.title === CATEGORIAS_ABA_TITULO);
  if (!jaExiste) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CATEGORIAS_ABA_TITULO } } }] }),
    });
    if (!addRes.ok) {
      return { ok: false, error: `Não foi possível criar a aba de categorias (status ${addRes.status})` };
    }
  }

  return { ok: true, sheetIdPrincipal: principal.sheetId };
}

async function escreverAbaCategorias(env, accessToken, categoriasAtivas) {
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values`;

  const clearRes = await fetch(`${sheetsUrl}/${encodeURIComponent(`${CATEGORIAS_ABA_TITULO}!A1:A1000`)}:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!clearRes.ok) {
    return { ok: false, error: `Não foi possível limpar a aba de categorias (status ${clearRes.status})` };
  }

  const updateRes = await fetch(
    `${sheetsUrl}/${encodeURIComponent(`${CATEGORIAS_ABA_TITULO}!A1`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: montarLinhasAbaCategorias(categoriasAtivas) }),
    }
  );
  if (!updateRes.ok) {
    return { ok: false, error: `Não foi possível gravar a aba de categorias (status ${updateRes.status})` };
  }
  return { ok: true };
}

// Aplica menus suspensos (data validation) nas colunas Categoria, EmPromocao,
// Ativo e Exposicao, sobre as linhas de produto atuais. Categoria aponta
// para a aba "Categorias" (mantida sempre atualizada à parte); as demais
// usam Sim/Nao fixo. `strict: false` deixa o menu como sugestão — digitar
// outra coisa continua funcionando (o servidor já lida com isso, ex.:
// categoria vira "Mix"). Reaplicado a cada sincronização porque as linhas
// de produtos mudam de posição conforme produtos são criados/removidos.
async function aplicarMenusSuspensos(env, accessToken, produtosRange, sheetIdPrincipal) {
  if (!produtosRange) return { ok: true };

  const requests = [
    requisicaoValidacaoLista(sheetIdPrincipal, produtosRange, COLUNA_EM_PROMOCAO, ["Sim", "Nao"]),
    requisicaoValidacaoLista(sheetIdPrincipal, produtosRange, COLUNA_ATIVO, ["Sim", "Nao"]),
    requisicaoValidacaoLista(sheetIdPrincipal, produtosRange, COLUNA_EXPOSICAO, ["Sim", "Nao"]),
    requisicaoValidacaoCategoriaCruzada(sheetIdPrincipal, produtosRange),
  ];

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!batchRes.ok) {
    return { ok: false, error: `Não foi possível aplicar os menus suspensos (status ${batchRes.status})` };
  }
  return { ok: true };
}

// Gera a planilha a partir do catálogo atual e grava no Google Sheets
// configurado. Usado pelo botão manual "Exportar para o Google Sheets" e
// pelo webhook que sincroniza automaticamente a cada alteração no GitHub.
export async function exportarCatalogoParaSheet(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.GOOGLE_SHEET_ID) {
    return { ok: false, error: "Escrita na planilha não configurada" };
  }

  const { produtos, categorias } = await getCatalogo(env);
  const { linhas, produtosRange, categoriasAtivas } = montarLinhasPlanilha(produtos, categorias);

  const accessToken = await getGoogleAccessToken(env);
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values`;

  // Limpa a aba inteira antes de escrever, para não sobrar linha antiga de
  // um produto removido do catálogo. Isso limpa só os valores das células —
  // formatação e menus suspensos (data validation) continuam intactos.
  const clearRes = await fetch(`${sheetsUrl}/A1:Z10000:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!clearRes.ok) {
    return { ok: false, error: `Não foi possível limpar a planilha (status ${clearRes.status})` };
  }

  // USER_ENTERED (em vez de RAW) faz números como preço e estoque virarem
  // números de verdade na planilha, do mesmo jeito que aconteceria se
  // alguém digitasse — com RAW ficariam como texto puro.
  const updateRes = await fetch(`${sheetsUrl}/A1?valueInputOption=USER_ENTERED`, {
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

  // A partir daqui os dados principais já estão salvos com sucesso — o que
  // falhar dessa parte em diante (aba de categorias, menus suspensos) não
  // desfaz a sincronização, só volta como um aviso.
  const aba = await garantirAbaCategorias(env, accessToken);
  if (!aba.ok) {
    return { ok: true, avisoMenus: aba.error };
  }

  const escreveu = await escreverAbaCategorias(env, accessToken, categoriasAtivas);
  if (!escreveu.ok) {
    return { ok: true, avisoMenus: escreveu.error };
  }

  const menus = await aplicarMenusSuspensos(env, accessToken, produtosRange, aba.sheetIdPrincipal);
  if (!menus.ok) {
    return { ok: true, avisoMenus: menus.error };
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
