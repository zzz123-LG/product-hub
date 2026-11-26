/* ============================================================
 * cloud.js — 云数据同步适配层（方案A：云数据库直连）
 * 后端：LeanCloud（国际/国内版均可），REST API 直连，无 SDK 依赖
 * 存储结构：
 *   - 类 PimMeta：单条记录 { rev, fileId, updatedAt }（版本号+文件指针）
 *   - 数据本体：AVFile JSON 文件（snapshot.json），整包读写
 * 冲突策略：last-write-wins（后保存覆盖先保存），版本历史兜底
 * 配置为空时所有函数静默跳过，行为与纯 localStorage 完全一致
 * ============================================================ */

const CLOUD_CONFIG = {
  appId: '',        // LeanCloud AppID（拿到后填入）
  appKey: '',       // LeanCloud AppKey（拿到后填入）
  apiBase: '',      // REST API 域名，形如 https://xxxx.lc-cn-share.com（不带尾部斜杠）
};

const CLOUD_META_CLASS = 'PimMeta';
const CLOUD_REV_KEY = 'pim_cloud_rev';
let _cloudPushTimer = null;
let _cloudBusy = false;

function cloudEnabled() {
  return !!(CLOUD_CONFIG.appId && CLOUD_CONFIG.appKey && CLOUD_CONFIG.apiBase);
}

function cloudHeaders(extra) {
  return Object.assign({
    'X-LC-Id': CLOUD_CONFIG.appId,
    'X-LC-Key': CLOUD_CONFIG.appKey,
    'Content-Type': 'application/json',
  }, extra || {});
}

function cloudStatus(msg, cls) {
  const el = document.getElementById('syncDot');
  if (!el) return;
  el.style.display = '';
  el.textContent = msg;
  el.title = '云端共享数据同步状态（点击手动同步）';
  el.className = 'sync-dot ' + (cls || '');
}

/* 读取 meta（返回 {objectId, rev, fileId} 或 null 表示云端无数据） */
async function cloudGetMeta() {
  const url = CLOUD_CONFIG.apiBase + '/1.1/classes/' + CLOUD_META_CLASS + '?limit=1';
  const res = await fetch(url, { headers: cloudHeaders() });
  if (!res.ok) throw new Error('meta read ' + res.status);
  const data = await res.json();
  const r = data.results && data.results[0];
  return r ? { objectId: r.objectId, rev: r.rev || 0, fileId: r.fileId || '', fileUrl: r.fileUrl || '' } : null;
}

/* 下载整包数据 JSON */
async function cloudDownload(fileUrl) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error('snapshot download ' + res.status);
  return await res.json();
}

/* 上传整包数据 JSON，返回 {fileId, fileUrl} */
async function cloudUpload(db) {
  const blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
  const res = await fetch(CLOUD_CONFIG.apiBase + '/1.1/files/snapshot.json', {
    method: 'POST',
    headers: cloudHeaders({ 'Content-Type': 'application/json' }),
    body: blob,
  });
  if (!res.ok) throw new Error('file upload ' + res.status);
  const data = await res.json();
  return { fileId: data.objectId, fileUrl: data.url };
}

/* 写 meta（存在则 PUT，不存在则 POST） */
async function cloudSaveMeta(meta, rev, fileId, fileUrl) {
  const body = JSON.stringify({ rev, fileId, fileUrl, updatedAt: new Date().toISOString() });
  let res;
  if (meta && meta.objectId) {
    res = await fetch(CLOUD_CONFIG.apiBase + '/1.1/classes/' + CLOUD_META_CLASS + '/' + meta.objectId, {
      method: 'PUT', headers: cloudHeaders(), body,
    });
  } else {
    res = await fetch(CLOUD_CONFIG.apiBase + '/1.1/classes/' + CLOUD_META_CLASS, {
      method: 'POST', headers: cloudHeaders(), body,
    });
  }
  if (!res.ok) throw new Error('meta save ' + res.status);
}

/* 整包推送（外部入口：saveDB 防抖调用 / 手动推送） */
async function cloudPush() {
  if (!cloudEnabled() || _cloudBusy || typeof DB === 'undefined' || !DB.products) return;
  _cloudBusy = true;
  try {
    cloudStatus('云同步中…', 'busy');
    const meta = await cloudGetMeta();
    const rev = ((meta && meta.rev) || 0) + 1;
    const { fileId, fileUrl } = await cloudUpload(DB);
    await cloudSaveMeta(meta, rev, fileId, fileUrl);
    try { localStorage.setItem(CLOUD_REV_KEY, String(rev)); } catch (e) { /* ignore */ }
    cloudStatus('已同步 r' + rev, 'ok');
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

/* 启动同步：init 后调用。云端有更新数据 → 覆盖本地并重渲染；云端无数据 → 本地为基准上传 */
async function cloudSync(onReady) {
  if (!cloudEnabled()) return;
  try {
    cloudStatus('连接云端…', 'busy');
    const meta = await cloudGetMeta();
    if (!meta || !meta.fileUrl) {
      /* 云端空白：以当前本地数据为基准初始化 */
      await cloudPush();
      return;
    }
    const localRev = parseInt(localStorage.getItem(CLOUD_REV_KEY) || '0', 10);
    const snap = await cloudDownload(meta.fileUrl);
    if (snap && snap.products && (meta.rev > localRev || localRev === 0)) {
      DB = snap;
      if (!DB.fakeMaps) DB.fakeMaps = [];
      if (!DB.accessories) DB.accessories = [];
      try { localStorage.setItem(CLOUD_REV_KEY, String(meta.rev)); } catch (e) { /* ignore */ }
      persistLocal(); /* 覆盖本地缓存，不触发云端回写，避免回环 */
      applySeedOwners();
      if (typeof onReady === 'function') onReady();
      cloudStatus('已同步 r' + meta.rev, 'ok');
    } else {
      cloudStatus('已同步 r' + Math.max(meta.rev, localRev), 'ok');
    }
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
