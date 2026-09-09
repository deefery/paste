const MAX_PASTE_BYTES = 200 * 1024;
const ID_BYTES = 12;
const EXPIRATIONS = Object.freeze({
  "3600": 3600,
  "86400": 86400,
  "604800": 604800,
  "2592000": 2592000,
  "0": 0,
});

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, ...headers },
  });
}

function json(data, status = 200) {
  return response(JSON.stringify(data), status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function html(body, status = 200) {
  return response(body, status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function randomId() {
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function tokenMatches(request, expected) {
  if (!expected) return false;
  const supplied = request.headers.get("Authorization") || "";
  const prefix = "Bearer ";
  if (!supplied.startsWith(prefix)) return false;
  const candidate = supplied.slice(prefix.length);
  if (candidate.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return "不会自动过期";
  return new Date(expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) + "（北京时间）";
}

function layout(title, content) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:dark;--bg:#0b0d12;--panel:#131722;--line:#262c3b;--text:#e8ecf4;--muted:#9099aa;--accent:#75a7ff;--accent2:#8ce6c1;--danger:#ff8b8b}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#172034 0,transparent 35%),var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}
    main{width:min(960px,calc(100% - 28px));margin:0 auto;padding:36px 0 56px}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.brand{color:var(--text);font-size:20px;font-weight:750;text-decoration:none;letter-spacing:.02em}.brand span{color:var(--accent2)}
    .panel{background:rgba(19,23,34,.94);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.25)}
    h1{font-size:22px;margin:0 0 6px}p{margin:0}.muted{color:var(--muted)}label{display:block;color:#cdd4e1;font-weight:650;margin:18px 0 7px}textarea,input,select{width:100%;border:1px solid #30384a;background:#0d111a;color:var(--text);border-radius:10px;padding:11px 12px;font:inherit;outline:none}textarea{min-height:390px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.5}textarea:focus,input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(117,167,255,.13)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}button,.button{border:0;border-radius:10px;padding:10px 15px;background:var(--accent);color:#071120;font:inherit;font-weight:750;cursor:pointer;text-decoration:none}.secondary{background:#252c3a;color:var(--text)}button:disabled{opacity:.55;cursor:wait}.status{color:var(--muted)}.error{color:var(--danger)}
    .meta{display:flex;gap:8px 16px;flex-wrap:wrap;color:var(--muted);margin:12px 0 18px}.paste{overflow:auto;background:#090c12;border:1px solid var(--line);border-radius:12px;padding:18px;min-height:160px;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.62 ui-monospace,SFMono-Regular,Consolas,monospace}.tok-key{color:#9ecbff}.tok-str{color:#a8e6bd}.tok-num{color:#ffc987}.tok-lit{color:#d8a7ff}.tok-com{color:#758198;font-style:italic}.token-help{display:none}.token-help.open{display:block}.small{font-size:13px}
    @media(max-width:640px){main{padding-top:22px}.panel{padding:15px;border-radius:13px}.grid{grid-template-columns:1fr}textarea{min-height:50vh}.actions>*{flex:1;text-align:center}.status{flex-basis:100%}}
  </style>
</head>
<body><main><header><a class="brand" href="/">paste<span>.zhijic.com</span></a><span class="muted small">私人文本中转站</span></header>${content}</main></body>
</html>`;
}

function homePage() {
  return layout("新建 Paste", `<section class="panel">
    <h1>新建 Paste</h1><p class="muted">未公开列出，仅拥有随机链接的人可以访问。</p>
    <form id="form">
      <label for="content">文本</label><textarea id="content" maxlength="${MAX_PASTE_BYTES}" required autofocus placeholder="粘贴日志、代码、配置或笔记……"></textarea>
      <div class="grid">
        <div><label for="language">语言</label><select id="language"><option value="auto">自动判断</option><option value="text">纯文本</option><option value="json">JSON</option><option value="javascript">JavaScript / TypeScript</option><option value="html">HTML / XML</option><option value="css">CSS</option><option value="shell">Shell / PowerShell</option><option value="python">Python</option><option value="markdown">Markdown</option></select></div>
        <div><label for="expires">有效期</label><select id="expires"><option value="3600">1 小时</option><option value="86400">1 天</option><option value="604800" selected>7 天</option><option value="2592000">30 天</option><option value="0">永不过期</option></select></div>
      </div>
      <label for="writeToken">创建口令</label><input id="writeToken" type="password" autocomplete="off" placeholder="Cloudflare WRITE_TOKEN">
      <p class="muted small">只保存在当前浏览器标签页，关闭标签页后清除。</p>
      <div class="actions"><button id="submit" type="submit">创建链接</button><span id="status" class="status"></span></div>
    </form>
  </section>
  <script>
    const form=document.getElementById('form'),token=document.getElementById('writeToken'),statusEl=document.getElementById('status'),button=document.getElementById('submit');
    token.value=sessionStorage.getItem('pasteWriteToken')||'';
    form.addEventListener('submit',async(event)=>{event.preventDefault();statusEl.className='status';statusEl.textContent='正在创建…';button.disabled=true;
      try{const value=token.value.trim();if(!value)throw new Error('请填写创建口令');sessionStorage.setItem('pasteWriteToken',value);
        const res=await fetch('/api/pastes',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+value},body:JSON.stringify({content:document.getElementById('content').value,language:document.getElementById('language').value,expiresIn:Number(document.getElementById('expires').value)})});
        const data=await res.json();if(!res.ok)throw new Error(data.error||'创建失败');location.assign(data.url);
      }catch(error){statusEl.className='status error';statusEl.textContent=error.message;}finally{button.disabled=false;}
    });
  </script>`);
}

function pastePage(id, paste) {
  const safeLanguage = escapeHtml(paste.language || "text");
  return layout(`Paste ${id}`, `<section class="panel">
    <h1>Paste</h1><div class="meta"><span>${escapeHtml(paste.language || "text")}</span><span>${new TextEncoder().encode(paste.content).byteLength.toLocaleString()} bytes</span><span>${escapeHtml(formatExpiry(paste.expiresAt))}</span></div>
    <pre id="paste" class="paste" data-language="${safeLanguage}">${escapeHtml(paste.content)}</pre>
    <div class="actions"><button id="copy" type="button">复制文本</button><a class="button secondary" href="/${encodeURIComponent(id)}/raw">原始文本</a><a class="button secondary" href="/">新建</a></div>
  </section>
  <script>
    const pre=document.getElementById('paste'),source=pre.textContent;
    const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    function tokenize(text,pattern,classFor){let out='',last=0;text.replace(pattern,(...args)=>{const match=args[0],offset=args.at(-2);out+=esc(text.slice(last,offset));out+='<span class="'+classFor(args)+'">'+esc(match)+'</span>';last=offset+match.length;return match;});return out+esc(text.slice(last));}
    function highlight(text,lang){if(lang==='json'||(lang==='auto'&&/^\\s*[\\[{]/.test(text))){return tokenize(text,/("(?:\\\\.|[^"\\\\])*")(\\s*:)?|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)/gi,a=>a[1]?(a[2]?'tok-key':'tok-str'):a[3]?'tok-lit':'tok-num');}if(['javascript','python','shell','css'].includes(lang)){return tokenize(text,/("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')|(\/\/.*|#.*$)|\\b(const|let|var|function|return|if|else|for|while|class|import|export|from|def|async|await|true|false|null|None|echo|select)\\b|\\b(\\d+(?:\\.\\d+)?)\\b/gm,a=>a[1]?'tok-str':a[2]?'tok-com':a[3]?'tok-key':'tok-num');}return esc(text);}
    pre.innerHTML=highlight(source,pre.dataset.language);
    document.getElementById('copy').addEventListener('click',async(e)=>{await navigator.clipboard.writeText(source);e.currentTarget.textContent='已复制';});
  </script>`);
}

async function createPaste(request, env) {
  if (!env.PASTES) return json({ error: "服务尚未配置 PASTES KV 绑定" }, 503);
  if (!env.WRITE_TOKEN) return json({ error: "服务尚未配置 WRITE_TOKEN" }, 503);
  if (!tokenMatches(request, env.WRITE_TOKEN)) return json({ error: "创建口令不正确" }, 401);

  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().includes("application/json")) return json({ error: "Content-Type 必须是 application/json" }, 415);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "JSON 格式无效" }, 400);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "JSON 必须是对象" }, 400);
  const content = typeof input.content === "string" ? input.content : "";
  if (!content.trim()) return json({ error: "文本不能为空" }, 400);
  const size = new TextEncoder().encode(content).byteLength;
  if (size > MAX_PASTE_BYTES) return json({ error: "文本不能超过 200 KiB" }, 413);

  const language = typeof input.language === "string" && /^[a-z0-9+-]{1,24}$/i.test(input.language) ? input.language.toLowerCase() : "text";
  const expiresIn = EXPIRATIONS[String(input.expiresIn)] ?? EXPIRATIONS["604800"];
  const createdAt = Date.now();
  const record = { content, language, createdAt, expiresAt: expiresIn ? createdAt + expiresIn * 1000 : null };

  let id;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = randomId();
    if (!(await env.PASTES.get(candidate))) {
      id = candidate;
      break;
    }
  }
  if (!id) return json({ error: "生成链接失败，请重试" }, 503);

  const options = expiresIn ? { expirationTtl: expiresIn } : undefined;
  await env.PASTES.put(id, JSON.stringify(record), options);
  const origin = new URL(request.url).origin;
  return json({ id, url: `${origin}/${id}`, expiresAt: record.expiresAt }, 201);
}

async function readPaste(id, env) {
  if (!env.PASTES) return null;
  const raw = await env.PASTES.get(id);
  if (!raw) return null;
  try {
    const paste = JSON.parse(raw);
    if (paste.expiresAt && paste.expiresAt <= Date.now()) {
      await env.PASTES.delete(id);
      return null;
    }
    return paste;
  } catch {
    return null;
  }
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/") return html(homePage());
  if (request.method === "POST" && path === "/api/pastes") return createPaste(request, env);
  if (request.method === "GET" && path === "/robots.txt") return response("User-agent: *\nDisallow: /\n", 200, { "Content-Type": "text/plain; charset=utf-8" });
  if (request.method === "GET" && path === "/favicon.ico") return response(null, 204);

  const rawMatch = path.match(/^\/([A-Za-z0-9_-]{16})\/raw$/);
  const pageMatch = path.match(/^\/([A-Za-z0-9_-]{16})$/);
  const id = rawMatch?.[1] || pageMatch?.[1];
  if (id) {
    const paste = await readPaste(id, env);
    if (!paste) return html(layout("未找到", `<section class="panel"><h1>Paste 不存在或已过期</h1><p class="muted">请检查链接，或新建一个 Paste。</p><div class="actions"><a class="button" href="/">新建 Paste</a></div></section>`), 404);
    if (rawMatch) return response(paste.content, 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" });
    return html(pastePage(id, paste));
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  return html(layout("未找到", `<section class="panel"><h1>404</h1><p class="muted">这里什么也没有。</p></section>`), 404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export { escapeHtml, randomId, tokenMatches, MAX_PASTE_BYTES };
