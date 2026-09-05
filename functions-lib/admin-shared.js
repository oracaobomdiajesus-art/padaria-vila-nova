// Shared helpers for the admin panel's Pages Functions (list.js / toggle.js).
// Never log or return env.GITHUB_TOKEN or env.ADMIN_PASSWORD in any response.

export const OWNER = "oracaobomdiajesus-art";
export const REPO = "padaria-vila-nova";
export const BRANCH = "main";
export const ALLOWED_DIRS = ["content/produtos", "content/categorias"];

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
