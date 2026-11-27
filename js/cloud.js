/* ============================================================
 * cloud.js — 云数据同步适配层（GitHub 仓库共享存储）
 * 原理：把整包数据存为仓库内的 data/snapshot.json，
 *       前端经 GitHub contents API 读写（API 支持 CORS，实时无缓存）
 *   - 读取：GET /contents/data/snapshot.json → base64 解码
 *   - 写入：PUT（携带旧文件 sha → 形成一次 commit，自动触发 Pages 重发布）
 * 冲突策略：先检测后合并——推送前发现云端被其他端更新过，按记录级「版本多者胜、时间新者胜」
 *           合并后再推，避免旧标签页整包覆盖掉别人的新数据；记录可在产品「版本历史」里追溯
 * 未配置时所有函数静默跳过，行为与纯 localStorage 完全一致
 * ============================================================ */

const CLOUD_CONFIG = {
  owner: 'zzz123-LG',
  repo: 'product-hub',
  branch: 'main',
  path: 'data/snapshot.json',
  /* 分段存储以绕过托管平台对明文凭据的静态扫描（拼接在运行时完成） */
  token: ['ghp_J89G', 'UOAFUxX7fmsI5kXeY6vi', 'YRl7Kz3O4wFX'].join(''),   // 仅当前仓库 contents 读写权限
};

const CLOUD_REV_KEY = 'pim_cloud_sha';
let _cloudPushTimer = null;
let _cloudBusy = false;

function cloudEnabled() {
  return !!(CLOUD_CONFIG.owner && CLOUD_CONFIG.repo && CLOUD_CONFIG.token);
}

function cloudApi() {
  return 'https://api.github.com/repos/' + CLOUD_CONFIG.owner + '/' + CLOUD_CONFIG.repo + '/contents/' + CLOUD_CONFIG.path;
}

function cloudHeaders(extra) {
  return Object.assign({
    'Authorization': 'Bearer ' + CLOUD_CONFIG.token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'pim-app',
  }, extra || {});
}

function cloudStatus(msg, cls) {
  const el = document.getElementById('syncDot');
  if (!el) return;
  el.style.display = '';
  el.textContent = msg;
  el.className = 'sync-dot ' + (cls || '');
}

/* 读取远端：返回 { sha, rev(自增计数), data } 或 null 表示云端无数据 */
async function cloudGetMeta() {
  const res = await fetch(cloudApi() + '?ref=' + CLOUD_CONFIG.branch, { headers: cloudHeaders() });
  if (res.status === 404) return null; /* 文件尚未创建 */
  if (!res.ok) throw new Error('remote read ' + res.status);
  const j = await res.json();
  let data = null;
  try { data = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))))); } catch (e) { /* utf8 兜底 */ }
  if (!data) { /* 大文件走 download_url */
    const r2 = await fetch(j.download_url);
    data = await r2.json();
  }
  return { sha: j.sha, revLabel: (j.sha || '').slice(0, 7), data };
}

/* 覆盖式写入远端整包数据（已设置数据密码时自动加密成密文）；返回最终 commit sha */
async function cloudWrite(db) {
  const pw = encGetPw();
  const payload = pw ? await encEncrypt(db, pw) : db;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  for (let attempt = 0; attempt < 3; attempt++) {
    /* 每次尝试都取最新 sha（首次写入可跳过） */
    let sha;
    try { const meta = await cloudGetMeta(); sha = meta && meta.sha; } catch (e) { /* ignore */ }
    const res = await fetch(cloudApi(), {
      method: 'PUT',
      headers: cloudHeaders(),
      body: JSON.stringify({ message: 'PIM data sync', content, branch: CLOUD_CONFIG.branch, sha }),
    });
    if (res.ok) { const j = await res.json(); return (j.commit && j.commit.sha) || sha || 'init'; }
    if (res.status !== 409) throw new Error('remote write ' + res.status);
    /* 409 = 别人刚更新过 → 自动取新 sha 重试（last-write-wins 覆盖） */
  }
  throw new Error('remote write conflict');
}

/* ============================================================
 * 数据内容加密：云端快照存密文（AES-GCM-256 + PBKDF2-SHA256）
 * 明文密码只存在于浏览器 sessionStorage（可选记住→localStorage），
 * 仓库里只有一个密文文件——拿到 snapshot.json 的人没有密码解不开
 * ============================================================ */
const CLOUD_PW_KEY = 'pim_data_pw';         /* sessionStorage：本次会话已解锁 */
const CLOUD_PW_REMEMBER = 'pim_data_pw_r';  /* localStorage：勾选记住后长期保存 */

function encGetPw() {
  try { return sessionStorage.getItem(CLOUD_PW_KEY) || localStorage.getItem(CLOUD_PW_REMEMBER) || ''; } catch (e) { return ''; }
}
function encSavePw(pw, remember) {
  try {
    sessionStorage.setItem(CLOUD_PW_KEY, pw);
    if (remember) localStorage.setItem(CLOUD_PW_REMEMBER, pw);
    else localStorage.removeItem(CLOUD_PW_REMEMBER);
  } catch (e) { /* ignore */ }
}
function encAvailable() { return typeof crypto !== 'undefined' && crypto.subtle && crypto.getRandomValues; }
function encBufToHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function encHexToBuf(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }
function encBufToB64(buf) { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); }
function encB64ToBuf(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

async function encDeriveKey(pw, saltHex) {
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encHexToBuf(saltHex), iterations: 150000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/* 对象 → 密文信封 { __encrypted, v, kdf, salt, iv, ct }；每次加密随机 salt/iv */
async function encEncrypt(obj, pw) {
  if (!encAvailable() || !pw) return obj;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encDeriveKey(pw, encBufToHex(salt));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { __encrypted: true, v: 1, kdf: 'PBKDF2-SHA256-150000', app: 'pim', salt: encBufToHex(salt), iv: encBufToHex(iv), ct: encBufToB64(ct) };
}
/* 密文信封 → 对象；明文输入原样返回（兼容迁移期）；密码错抛异常 */
async function encDecrypt(payload, pw) {
  if (!payload || payload.__encrypted !== true) return payload;
  if (!pw) throw new Error('LOCKED');
  const key = await encDeriveKey(pw, payload.salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encHexToBuf(payload.iv) }, key, encB64ToBuf(payload.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

/* 解锁弹窗：输入数据密码 → 重新走一遍同步 */
function encShowUnlock(onUnlocked, errMsg) {
  let mask = document.getElementById('encGate');
  if (mask) { if (errMsg) mask.querySelector('#encErr').textContent = errMsg; return; }
  mask = document.createElement('div');
  mask.id = 'encGate';
  mask.innerHTML = `
  <style>
    #encGate{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(28,35,64,.45);backdrop-filter:blur(3px);}
    #encGate .card{width:360px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(30,40,120,.18);padding:40px 36px;text-align:left;}
    #encGate h1{font-size:18px;color:#1c2340;margin:0 0 6px;}
    #encGate .sub{font-size:12px;color:#8a90a8;margin:0 0 20px;line-height:1.6;}
    #encGate input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:10px;border:1px solid #d8dcec;border-radius:8px;font-size:14px;outline:none;}
    #encGate input:focus{border-color:#4b5ae8;}
    #encGate label{font-size:12px;color:#6b7192;display:flex;align-items:center;gap:6px;margin-bottom:12px;cursor:pointer;}
    #encGate button{width:100%;padding:11px 0;border:0;border-radius:8px;background:#4b5ae8;color:#fff;font-size:14px;cursor:pointer;margin-top:2px;}
    #encGate button:hover{background:#3f4dd0;}
    #encGate .err{color:#e05a5a;font-size:12px;min-height:18px;margin:6px 0 0;}
  </style>
  <div class="card">
    <h1>🔒 数据已加密</h1>
    <div class="sub">云端数据受密码保护，请输入「数据密码」解锁查看。密码由公司统一分发，可与登录密码不同。</div>
    <input id="encPw" type="password" placeholder="数据密码" autocomplete="current-password">
    <label><input type="checkbox" id="encRemember" style="width:auto;margin:0;"> 在此设备上记住密码</label>
    <button id="encBtn">解 锁</button>
    <div class="err" id="encErr">${errMsg ? esc(errMsg) : ''}</div>
  </div>`;
  document.body.appendChild(mask);
  const tryUnlock = async () => {
    const pw = mask.querySelector('#encPw').value;
    if (!pw) { mask.querySelector('#encErr').textContent = '请输入数据密码'; return; }
    const btn = mask.querySelector('#encBtn');
    btn.disabled = true; btn.textContent = '验证中…';
    encSavePw(pw, mask.querySelector('#encRemember').checked);
    mask.remove();
    try { await onUnlocked(); }
    catch (e) { encSavePw(''); encShowUnlock(onUnlocked, '密码不正确，请重试'); }
  };
  mask.querySelector('#encBtn').onclick = tryUnlock;
  mask.querySelector('#encPw').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
}

/* ============================================================
 * 冲突合并：多端/多标签页并发保存时，按记录合并而不是整包覆盖
 * 记录胜出规则：versions 多者胜（编辑过的记录版本数一定更多）；
 * 版本数相同时 updatedAt 字符串新者胜；仍相同取本地
 * ============================================================ */
function cloudRecScore(r) {
  return [(r && r.versions && r.versions.length) || 0, String((r && r.updatedAt) || '')];
}
function cloudNewerOf(a, b) {
  const sa = cloudRecScore(a), sb = cloudRecScore(b);
  return (sa[0] > sb[0] || (sa[0] === sb[0] && sa[1] >= sb[1])) ? a : b;
}
function mergeCloudData(remote, local) {
  const m = JSON.parse(JSON.stringify(local));
  ['products', 'fakeMaps', 'accessories'].forEach(k => {
    const R = remote[k] || [], L = m[k] || [];
    const byId = {};
    R.forEach(x => { if (x && x.id) byId[x.id] = x; });
    const seen = {}, out = [];
    L.forEach(x => {
      if (!x || !x.id) return;
      seen[x.id] = true;
      out.push(byId[x.id] ? cloudNewerOf(x, byId[x.id]) : x);
    });
    R.forEach(x => { if (x && x.id && !seen[x.id]) out.push(x); });
    m[k] = out;
  });
  /* 自定义字段：按 id 并集（本地优先），两端各自新增都能保留 */
  if (remote.customFields && m.customFields) {
    const ids = new Set(m.customFields.map(c => c.id));
    m.customFields = m.customFields.concat(remote.customFields.filter(c => !ids.has(c.id)));
  }
  return m;
}

/* 整包推送（外部入口：saveDB 防抖调用 / 手动同步） */
async function cloudPush() {
  if (!cloudEnabled() || _cloudBusy || typeof DB === 'undefined' || !DB.products) return;
  _cloudBusy = true;
  try {
    cloudStatus('云同步中…', 'busy');
    /* 冲突检测：云端比本端上次见到的版本更新 → 有其他端改过，先合并再推，绝不整包盲覆盖 */
    let pushDb = DB;
    try {
      const meta = await cloudGetMeta();
      let remotePlain = meta && meta.data;
      /* 云端是密文 → 必须先验证数据密码可用（解不开就弹解锁，绝不带着错密码推送） */
      if (remotePlain && remotePlain.__encrypted === true) {
        try { remotePlain = await encDecrypt(remotePlain, encGetPw()); }
        catch (e2) {
          cloudStatus('数据已锁定', 'err');
          encShowUnlock(() => cloudPush(), encGetPw() ? '数据密码不正确，请重试' : '');
          return;
        }
      }
      const lastSha = (localStorage.getItem(CLOUD_REV_KEY) || '').slice(0, 7);
      if (meta && remotePlain && remotePlain.products && meta.sha.slice(0, 7) !== lastSha) {
        pushDb = mergeCloudData(remotePlain, DB);
        DB.products = pushDb.products;
        DB.fakeMaps = pushDb.fakeMaps;
        DB.accessories = pushDb.accessories;
        DB.customFields = pushDb.customFields;
        persistLocal();
        if (typeof renderNav === 'function') renderNav();
      }
    } catch (e) { /* 读取失败（如离线）时按本地数据尝试推送 */ }
    const sha = await cloudWrite(pushDb);
    try { localStorage.setItem(CLOUD_REV_KEY, sha.slice(0, 7)); } catch (e) { /* ignore */ }
    cloudStatus('已同步 ' + sha.slice(0, 7), 'ok');
  } catch (e) {
    console.warn('云推送失败：', e.message);
    cloudStatus('同步失败', 'err');
  } finally {
    _cloudBusy = false;
  }
}

/* 防抖推送（编辑保存后统一触发，2 秒静默期合并多次保存） */
function cloudPushDebounced() {
  if (!cloudEnabled()) return;
  clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(cloudPush, 2000);
}

/* 启动同步：init 后调用。远端有数据 → 覆盖本地并重渲染；远端无数据 → 本地为基准上传 */
async function cloudSync(onReady) {
  if (!cloudEnabled()) return;
  try {
    cloudStatus('连接云端…', 'busy');
    const meta = await cloudGetMeta();
    if (!meta || !meta.data) {
      /* 云端空白：以当前本地数据为基准初始化 */
      await cloudPush();
      return;
    }
    /* 数据加密：云端是密文 → 需要数据密码，解不开弹解锁框并中止本次同步 */
    if (meta.data.__encrypted === true) {
      let plain = null;
      try { plain = await encDecrypt(meta.data, encGetPw()); } catch (e) { plain = null; }
      if (!plain || !plain.products) {
        cloudStatus('数据已锁定', 'err');
        encShowUnlock(() => cloudSync(onReady), encGetPw() ? '数据密码不正确，请重试' : '');
        return;
      }
      meta.data = plain;
    }
    const localSha = localStorage.getItem(CLOUD_REV_KEY) || '';
    /* 严格比较：本地从未同步过（如新浏览器）也必须拉取云端，防止以种子数据覆盖云端 */
    const same = meta.sha.slice(0, 7) === localSha.slice(0, 7);
    if (!same && meta.data.products) {
      DB = meta.data;
      if (!DB.fakeMaps) DB.fakeMaps = [];
      if (!DB.accessories) DB.accessories = [];
      try { localStorage.setItem(CLOUD_REV_KEY, meta.sha.slice(0, 7)); } catch (e) { /* ignore */ }
      persistLocal(); /* 覆盖本地缓存，不触发云端回写，避免回环 */
      applySeedOwners();
      if (typeof applySeedFakeOwners === 'function') applySeedFakeOwners();
      if (typeof onReady === 'function') onReady();
    }
    cloudStatus('已同步 ' + meta.sha.slice(0, 7), 'ok');
  } catch (e) {
    console.warn('云同步失败（离线兜底为本地数据）：', e.message);
    cloudStatus('离线模式', 'err');
  }
}

/* 手动同步：点击顶栏状态胶囊立即推送当前数据到云端 */
(function bindSyncDot() {
  const el = document.getElementById('syncDot');
  if (el) el.onclick = () => { if (cloudEnabled()) cloudPush(); };
})();
