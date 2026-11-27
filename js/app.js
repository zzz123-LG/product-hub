/* =========================================================
 * 产品信息中心 PIM · 智能锁产品库
 * 前端演示版：localStorage 持久化 + SheetJS 导入导出
 * 功能：结构化字段+自定义字段 / 富文本 / 文件识别校对 / 搜索筛选
 *       权限角色 / 版本历史审计 / 审核流 / 协作评论 / 附件
 *       导入导出 / 看板统计 / 数据质量 / 回收站
 * ======================================================= */
'use strict';

/* ---------------- 工具 ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtMoney = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? '—' : '¥' + Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const AVATAR_COLORS = ['#3b5bfd', '#0891b2', '#d97706', '#7c3aed', '#16a34a', '#dc2626'];
const avatarColor = (name) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------------- 数据结构定义 ---------------- */
const STRUCT_FIELDS = [
  { k: 'model', label: '型号/SKU', type: 'text', required: true },
  { k: 'series', label: '产品系列', type: 'enum', options: ['玄武', '麒麟', '大圣', '小嘀', '假锁', '保险柜', '配件'], required: true },
  { k: 'category', label: '品类', type: 'enum', options: ['智能锁', '智能保管柜', '配件'] },
  { k: 'channel', label: '销售渠道', type: 'enum', options: ['全渠道', '线上', '电商', 'PDD', '苏宁易购', '京东', '创新', '线下', '运营商'] },
  { k: 'brand', label: '品牌', type: 'enum', options: ['DSM', 'DI'] },
  { k: 'status', label: '产品状态', type: 'enum', options: ['正常', '预下市', '全渠道预下市', '线下预下市', '全渠道下市', '线下下市', '线上下市', '下市', '高端黑全渠道下市', '高端黑全渠道下市咖啡金全渠道已下市', '高端黑转为线上专供', '线下转创新'], required: true },
  { k: 'launchDate', label: '上市时间', type: 'date', required: true },
  { k: 'statusChangeDate', label: '状态变更时间', type: 'date' },
  { k: 'priceNormal', label: '日常价（元）', type: 'number', required: true },
  { k: 'pricePromo', label: '大促价（元）', type: 'number' },
  { k: 'priceS', label: 'S大促价（元）', type: 'number' },
  { k: 'priceOnlineDist', label: '线上分销价（元）', type: 'number' },
  { k: 'priceDealer', label: '经销商供货价（元）', type: 'number' },
  { k: 'priceBulk50', label: '50套促销价（元）', type: 'number' },
  { k: 'priceBulk100', label: '100套促销价（元）', type: 'number' },
  { k: 'priceSmartHome', label: '智能家居价（元）', type: 'number' },
  { k: 'priceSubsidy', label: '国补到手价（元）', type: 'number' },
  { k: 'pricePubDaily', label: '普惠价·日常无会员券（元）', type: 'number', promoGroup: true },
  { k: 'pricePubSubsidy', label: '国补后到手价 15%（元）', type: 'number', promoGroup: true },
  { k: 'priceActPub', label: '普惠价·活动9折（元）', type: 'number', promoGroup: true },
  { k: 'priceCouponDeal', label: '会员券后到手价（元）', type: 'number', promoGroup: true },
  { k: 'priceCouponSubDeal', label: '会员国补到手价 15%（元）', type: 'number', promoGroup: true },
  { k: 'promoNote', label: '电商价格备注', type: 'text', promoGroup: true, multiline: true },
  { k: 'owner', label: '负责人', type: 'enum', options: ['楼洋昕', '张国焘', '任旭岩', '李宇翔', '杜存玉', '蔡得利', '朱雨欣', '胡桂旭明', '赵雨薇'], required: true },
  { k: 'targetMarket', label: '目标市场', type: 'text' },
];
const FIELD_MAP = Object.fromEntries(STRUCT_FIELDS.map(f => [f.k, f.label]));
const FIELD_KEYS = STRUCT_FIELDS.map(f => f.k);
/* 价格字段：详情页「发文价格」表格的列（按 STRUCT_FIELDS 顺序） */
const PRICE_KEYS = STRUCT_FIELDS.filter(x => x.type === 'number' && !x.promoGroup).map(x => x.k);
/* 电商价格表：两级表头（表头分组 → 列），字段带 promoGroup: true 不进发文价格表；cols: [字段, 表头文案] */
const PROMO_GROUPS = [
  { name: '日常-无会员券', cols: [['pricePubDaily', '普惠价'], ['pricePubSubsidy', '国补后到手（15%）']] },
  { name: '活动有会员券-9折', cols: [['priceActPub', '普惠价'], ['priceCouponDeal', '会员券后到手'], ['priceCouponSubDeal', '会员国补到手价（15%）']] },
];
const PROMO_COLS = PROMO_GROUPS.flatMap(g => g.cols.map(c => c[0]));
const ROLES = {
  admin: '管理员', reviewer: '审核者', editor: '编辑者', writer: '填写者', viewer: '查看者',
};
const USERS = [
  { name: '楼洋昕', role: 'admin' },
  { name: '张国焘', role: 'reviewer' },
  { name: '任旭岩', role: 'editor' },
  { name: '李宇翔', role: 'writer' },
  { name: '杜存玉', role: 'viewer' },
];
/* 历史占位负责人 → 实际负责人 映射（用于迁移旧数据） */
const LEGACY_OWNER_MAP = { '张伟': '楼洋昕', '李娜': '张国焘', '王强': '任旭岩', '赵敏': '李宇翔', '陈晨': '杜存玉' };
const LOCK_SERIES = ['玄武', '麒麟', '大圣', '小嘀'];
const NAVS = [
  { id: 'dashboard', label: '总览', group: '核心模块' },
  { id: 'products', label: '产品中心', group: '核心模块', badge: 'locks', scope: LOCK_SERIES },
  { id: 'fakeLock', label: '假锁中心', group: '核心模块', badge: 'fake' },
  { id: 'accessories', label: '配件定价', group: '核心模块', badge: 'acc' },
  { id: 'import', label: '导入识别', group: '治理与集成', badge: 'rec' },
  { id: 'review', label: '审核中心', group: '治理与集成', badge: 'pend', need: ['reviewer', 'admin'] },
  { id: 'quality', label: '数据质量', group: '治理与集成' },
  { id: 'settings', label: '数据字典', group: '治理与集成', need: ['admin'] },
  { id: 'bin', label: '回收站', group: '治理与集成', need: ['admin'] },
];
const VIEW_ALIAS = {}; // 视图均独立
const PAGE_TITLES = {
  dashboard: '总览', products: '产品中心', fakeLock: '假锁中心', accessories: '配件定价',
  import: '导入识别', review: '审核中心', quality: '数据质量', bin: '回收站', settings: '数据字典',
};
const PAGE_SUBS = {
  dashboard: '产品总数、状态分布、资料完整度与更新动态一览',
  products: '一个型号一个主ID · 价格按渠道维护 · 关键字段结构化可检索',
  fakeLock: '假锁（演示/陈列锁）与真锁型号的对应关系',
  accessories: '把手款 / 全自动 / 高端款通用配件 + 锁体及边条价格',
  import: '上传 Excel/CSV → 自动抽取字段 → 人工校对确认后入库',
  review: '新建与重大修改需审核通过后生效，防止错误信息污染搜索与决策',
  quality: '缺字段、长期未更新、无负责人、重复产品 — 持续治理',
  bin: '防止误删，可随时恢复',
  settings: '自定义字段配置与权限矩阵',
};
const ROLE_DESC = {
  admin: '数据管理员 · 全程权限',
  reviewer: '审核者 · 审批与发布',
  editor: '编辑者 · 全库编辑发布',
  writer: '填写者 · 编辑后提交待审',
  viewer: '查看者 · 只读访问',
};
const STATUS_CLASS = { '正常': 'st-normal', '预下市': 'st-pre-off', '全渠道预下市': 'st-pre-off', '线下预下市': 'st-pre-off', '全渠道下市': 'st-off', '高端黑全渠道下市': 'st-off', '高端黑转为线上专供': 'st-special' };
const DOC_CATS = ['规格书', '认证证书', '报价单', '产品图片', '竞品资料', '其他'];

/* ---------------- 状态与持久化 ---------------- */
const LS_KEY = 'pim_data_v12';
let DB = null;

function seedDB() {
  const products = window.SEED_PRODUCTS.map((p, i) => {
    const fields = {};
    FIELD_KEYS.forEach(k => { if (p[k] !== undefined && p[k] !== '') fields[k] = p[k]; });
    fields.category = fields.category || catOf(fields.series);
    return {
      id: p.id, fields,
      custom: {},
      description: `<p>${esc(p.series)}系列 <b>${esc(p.model)}</b>。日常价 ${fmtMoney(p.priceNormal)}，上市于 ${esc(p.launchDate || '—')}。价格体系含日常价 / 大促价 / S大促价 / 分销价等，请以最新审核版本为准。</p>`,
      tags: p.tags || [],
      attachments: i < 6 ? [{
        id: uid(), name: `${p.model}_规格书.pdf`, cat: '规格书', size: 380 + i * 66, type: 'application/pdf', date: '2026-10-20', note: '初始导入', text: `${p.model} 智能锁 规格书 指纹 密码 NFC 防撬报警`,
      }] : [],
      comments: i < 3 ? [{
        id: uid(), author: '楼洋昕', at: '2026-11-20 10:30',
        text: `@张国焘 请核对 ${p.model} 的 S大促价 与大促价，双11价格表里数值有调整。`,
      }] : [],
      versions: [{
        id: uid(), at: p.updatedAt || '2026-11-01', by: '系统导入',
        note: 'Excel 批量导入初始化',
        snapshot: JSON.parse(JSON.stringify(fields)),
        changes: [],
      }],
      recordStatus: 'published',
      subscribers: [],
      createdAt: p.createdAt || '2026-10-01',
      updatedAt: p.updatedAt || now(),
      updatedBy: '系统导入',
    };
  });
  return {
    products, bin: [],
    fakeMaps: (window.SEED_FAKEMAP || []).map(m => ({ ...m })),
    accessories: (window.SEED_ACCESSORIES || []).map(a => ({ ...a })),
    customFields: [
      { id: 'cf3', label: '电商链接', type: 'text', options: [], required: false, applies: 'all' },
    ],
    recQueue: [], recLog: [],
    users: USERS, todos: [],
    savedFilters: [], searchHistory: [],
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { DB = JSON.parse(raw); if (DB && DB.products) { if (!DB.fakeMaps) DB.fakeMaps = (window.SEED_FAKEMAP || []).map(m => ({ ...m })); if (!DB.accessories) DB.accessories = (window.SEED_ACCESSORIES || []).map(a => ({ ...a })); applySeedFakeOwners(); return; } }
    /* 版本迁移：当前 key 不存在时，自动从所有旧版本 key（v{当前-1} ~ v1）继承数据，避免升级丢数据 */
    const curV = parseInt((LS_KEY.match(/(\d+)$/) || [0, 0])[1], 10);
    for (let v = curV - 1; v >= 1; v--) {
      const old = localStorage.getItem('pim_data_v' + v);
      if (old) {
        try {
          const oldDB = JSON.parse(old);
          if (oldDB && oldDB.products && oldDB.products.length) {
            DB = oldDB;
            if (!DB.fakeMaps) DB.fakeMaps = (window.SEED_FAKEMAP || []).map(m => ({ ...m }));
            if (!DB.accessories) DB.accessories = (window.SEED_ACCESSORIES || []).map(a => ({ ...a }));
            applySeedOwners(); applySeedFakeOwners();
            saveDB();
            try { localStorage.removeItem('pim_data_v' + v); } catch (e2) { /* ignore */ }
            return;
          }
        } catch (e) { break; }
      }
    }
  } catch (e) { /* ignore */ }
  DB = seedDB(); applySeedOwners(); applySeedFakeOwners(); saveDB();
}
/* 假锁负责人指定：E系列 / V20系列 → 赵雨薇（幂等，所有启动/云端覆盖路径都会执行） */
function applySeedFakeOwners() {
  const smById = Object.fromEntries((window.SEED_FAKEMAP || []).map(m => [m.id, m]));
  (DB.fakeMaps || []).forEach(m => {
    const sm = smById[m.id];
    if (sm && sm.owner) m.owner = sm.owner;
  });
  /* 清理已下线的自定义字段（防水等级/即热式），并抹掉产品上的遗留值 */
  const REMOVED_CF = ['cf1', 'cf2', '防水等级', '即热式'];
  if (DB.customFields) {
    DB.customFields = DB.customFields.filter(cf => !REMOVED_CF.includes(cf.id) && !REMOVED_CF.includes(cf.label));
    (DB.products || []).forEach(p => {
      if (!p.custom) return;
      REMOVED_CF.forEach(k => { delete p.custom[k]; });
    });
  }
  /* 清理已下线的价格列（渠道精简：统一报名/抖音/京东/天猫/高管直播/淘宝C店/零售应对/以旧换新），抹掉存量值 */
  const REMOVED_PRICE = ['priceUnified', 'priceDouyinNov', 'priceJD151', 'priceJD161', 'priceTm151', 'priceTm161', 'priceDouyinHigh', 'priceZcSubsidy', 'priceDouyinLive', 'priceZcLive', 'priceTaobaoCDeal', 'priceRetailNov', 'priceRetailDec', 'priceTradeIn'];
  (DB.products || []).forEach(p => {
    if (!p.fields) return;
    delete p.fields.priceDouyinDec;
    delete p.fields.priceTaobaoC;
    REMOVED_PRICE.forEach(k => { delete p.fields[k]; });
  });
}
/* 负责人指定：与 seed.js 保持一致，迁移/初始化后强制对齐最新分配；历史占位名一并映射到实际负责人 */
function applySeedOwners() {
  const byId = Object.fromEntries((DB.products || []).map(p => [p.id, p]));
  (window.SEED_PRODUCTS || []).forEach(sp => {
    if (!sp.owner) return;
    const p = byId[sp.id];
    if (p) { p.fields = p.fields || {}; p.fields.owner = sp.owner; }
  });
  (DB.products || []).forEach(p => {
    const legacy = LEGACY_OWNER_MAP[p.fields && p.fields.owner];
    if (legacy) p.fields.owner = legacy;
  });
}
function persistLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) { console.warn('storage full', e); } }
/* 保存：写本地缓存 + 防抖回写云端（cloud.js 配置为空时回写自动跳过） */
function saveDB() { persistLocal(); if (typeof cloudPushDebounced === 'function') cloudPushDebounced(); }

/* ---------------- 权限 ---------------- */
let ME = { name: '楼洋昕', role: 'admin' };
const can = (action) => {
  const r = ME.role;
  const m = {
    view: true,
    create: ['admin', 'reviewer', 'editor', 'writer'].includes(r),
    editOwn: ['admin', 'reviewer', 'editor', 'writer'].includes(r),
    editAll: ['admin', 'reviewer', 'editor'].includes(r),
    directPublish: ['admin', 'reviewer', 'editor'].includes(r),
    review: ['admin', 'reviewer'].includes(r),
    delete: ['admin'].includes(r),
    settings: ['admin'].includes(r),
    comment: r !== 'viewer',
  };
  return m[action] !== undefined ? m[action] : false;
};

/* ---------------- 导航 ---------------- */
let currentView = 'dashboard';
function renderNav() {
  const items = NAVS.filter(n => !n.need || n.need.includes(ME.role));
  const badgeOf = (n) => {
    if (!n.badge) return 0;
    if (n.badge === 'locks') return DB.products.filter(p => LOCK_SERIES.includes(p.fields.series)).length;
    if (n.badge === 'fake') return (DB.fakeMaps || []).length;
    if (n.badge === 'acc') return (DB.accessories || []).length;
    if (n.badge === 'pend') return pendingCount();
    if (n.badge === 'rec') return DB.recQueue.filter(r => r.status === 'pending').length;
    return 0;
  };
  const groups = [...new Set(items.map(n => n.group))];
  $('#sidenav').innerHTML = `
    <div class="side-brand">
      <div><div class="b-name">锁云 · 产品主数据</div><div class="b-sub">PIMDM PLATFORM</div></div>
    </div>
    ${groups.map(g => `
      <div class="nav-group-label">${g}</div>
      ${items.filter(n => n.group === g).map(n => {
        const b = badgeOf(n);
        return `<button class="nav-item ${currentView === n.id ? 'active' : ''}" data-v="${n.id}">${n.label}${b ? `<span class="badge">${b}</span>` : ''}</button>`;
      }).join('')}`).join('')}
    <div class="side-user">
      <div class="avatar" id="ucAvatar">陈</div>
      <div class="u-info">
        <div class="u-name" id="ucName"></div>
        <div class="u-desc" id="ucDesc"></div>
        <select id="userSelect" title="切换角色（演示用）"></select>
      </div>
    </div>`;
  $$('#sidenav .nav-item').forEach(b => b.onclick = () => go(b.dataset.v));
  const mobItems = items.slice(0, 5);
  $('#mobNav').innerHTML = mobItems.map(n => {
    const b = badgeOf(n);
    return `<button class="${currentView === n.id ? 'active' : ''}" data-v="${n.id}">${n.label}${b ? `<span class="badge">${b}</span>` : ''}</button>`;
  }).join('');
  $$('#mobNav button').forEach(b => b.onclick = () => go(b.dataset.v));
  $('#userSelect').onchange = (e) => {
    const u = DB.users.find(x => x.name === e.target.value);
    ME = { name: u.name, role: u.role };
    renderUser(); renderNav(); go(currentView);
    toast(`已切换为 ${u.name}（${ROLES[u.role]}）`, 'ok');
  };
  renderUser();
}
function go(v) {
  currentView = v;
  // 进入带范围的列表视图（产品中心/假锁中心/配件定价）时应用系列范围与默认排序
  const nav = NAVS.find(n => n.id === v);
  if (nav && nav.scope) {
    if (listState.scope !== nav.scope) {
      listState.scope = nav.scope;
      listState.q = '';
      listState.page = 1;
      if (v === 'accessories') { listState.sort = 'priceNormal'; listState.dir = -1; }
      else { listState.sort = 'launchDate'; listState.dir = -1; }
    }
  } else if (listState.scope) {
    listState.scope = null;
  }
  renderNav();
  $('#pageTitle').textContent = PAGE_TITLES[v] || v;
  const viewId = VIEW_ALIAS[v] || v;
  $$('.view').forEach(s => s.classList.remove('active'));
  $('#view-' + viewId).classList.add('active');
  ({ dashboard: renderDashboard, products: renderProducts, fakeLock: renderFakeLock, accessories: renderAccessories, import: renderImport, review: renderReview, quality: renderQuality, bin: renderBin, settings: renderSettings })[viewId]();
  window.scrollTo(0, 0);
}
const pendingCount = () => DB.products.filter(p => p.recordStatus === 'pending').length;

/* =========================================================
 * 假锁中心：假锁型号 ↔ 真锁型号映射 + 价格
 * ======================================================= */
let fakeState = { series: '', expand: new Set() };
const fmtPrice = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '—' : '¥' + Number(v).toLocaleString('zh-CN');

function renderFakeLock() {
  const el = $('#view-fakeLock');
  const maps = (DB.fakeMaps || []);
  const seriesList = [...new Set(maps.map(m => m.series))];
  const rows = maps.filter(m => !fakeState.series || m.series === fakeState.series);
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>假锁中心</h1>
        <div class="sub">${PAGE_SUBS.fakeLock} · 共 ${rows.length} 个假锁型号</div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="addMap" ${can('editAll') ? '' : 'disabled title=\"无权限\"'}>＋ 新建映射</button>
      </div>
    </div>
    <div class="toolbar">
      <select id="fkSeries"><option value="">全部系列</option>${seriesList.map(s => `<option ${fakeState.series === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <span class="spacer"></span>
      <span class="count-tip">${can('editAll') ? '所有列双击即可修改 · 点「编辑」打开完整表单' : ''} · 共 ${rows.length} 个假锁</span>
    </div>
    <div class="table-wrap">
      <table class="list fake-table"><thead><tr>
        <th style="width:36px"></th><th>系列</th><th>假锁型号</th><th>通用真锁型号</th>
        <th>日常价</th><th>电商分销价</th><th>线下供货价</th><th>负责人</th><th>状态</th><th style="width:120px">操作</th>
      </tr></thead><tbody>
      ${rows.map(m => {
        const open = fakeState.expand.has(m.id);
        const ok = m.priceNormal !== null && m.priceNormal !== undefined && m.priceNormal !== '';
        const eT = can('editAll') ? 'editable' : '';
        const eTitle = can('editAll') ? ' title="双击可直接修改"' : '';
        return `
        <tr class="fk-row ${open ? 'open' : ''}" data-id="${m.id}">
          <td><button class="fk-toggle" data-toggle="${m.id}" title="${open ? '收起' : '展开'}">${open ? '−' : '+'}</button></td>
          <td class="editable ${eT}" data-id="${m.id}" data-field="series" data-type="select"${eTitle} style="color:var(--muted)">${esc(m.series)}</td>
          <td class="editable ${eT}" data-id="${m.id}" data-field="model" data-type="text"${eTitle}><span class="model">${esc(m.model)}</span>${open ? `<div class="sub-line">SKU：${esc(m.sku || '—')}</div>` : ''}</td>
          <td class="editable ${eT}" data-id="${m.id}" data-field="reals" data-type="reals"${eTitle}><div class="chip-line">${m.reals.map(r => `<span class="chip-real">${esc(r)}</span>`).join('')}${m.reals.length > 3 && !open ? `<span class="chip-more">+${m.reals.length - 3}</span>` : ''}${!m.reals.length ? '<span style="color:var(--muted)">未映射</span>' : ''}</div></td>
          <td class="price editable ${eT}" data-id="${m.id}" data-field="priceNormal" data-type="number"${eTitle}>${fmtPrice(m.priceNormal)}</td>
          <td class="price muted-p editable ${eT}" data-id="${m.id}" data-field="priceEcom" data-type="number"${eTitle}>${fmtPrice(m.priceEcom)}</td>
          <td class="price muted-p editable ${eT}" data-id="${m.id}" data-field="priceOffline" data-type="number"${eTitle}>${fmtPrice(m.priceOffline)}</td>
          <td class="editable ${eT}" data-id="${m.id}" data-field="owner" data-type="owner"${eTitle}>${esc(m.owner || '未指定')}</td>
          <td><span class="badge-st ${ok ? 'st-normal' : 'st-warn'}"><i class="dot"></i>${ok ? '正常' : '待补价'}</span></td>
          <td>${can('editAll') ? `<button class="link-btn" data-edit="${m.id}">编辑</button>${can('delete') ? ` · <button class="link-btn danger" data-del="${m.id}">删除</button>` : ''}` : '<span style="color:var(--muted)">—</span>'}</td>
        </tr>
        ${open ? `<tr class="fk-detail"><td></td><td colspan="9">
          <div class="fk-detail-inner">
            <span class="fk-k">假锁SKU</span><span class="editable ${eT}" data-id="${m.id}" data-field="sku" data-type="text"${eTitle} style="cursor:${can('editAll') ? 'cell' : 'default'}">${esc(m.sku || '双击填写')}</span>
            <span class="fk-k">映射真锁（${m.reals.length}）</span><span>${m.reals.map(r => `<span class="chip-real">${esc(r)}</span>`).join(' ') || '—'}</span>
          </div>
        </td></tr>` : ''}`;
      }).join('')}
      ${rows.length ? '' : '<tr><td colspan="10" style="text-align:center;padding:48px 0;color:var(--muted)">暂无假锁映射 · 点击右上角「新建映射」添加</td></tr>'}
      </tbody></table>
    </div>`;
  $('#fkSeries', el).addEventListener('change', e => { fakeState.series = e.target.value; renderFakeLock(); });
  $$('[data-toggle]', el).forEach(b => b.onclick = () => {
    const id = b.dataset.toggle;
    fakeState.expand.has(id) ? fakeState.expand.delete(id) : fakeState.expand.add(id);
    renderFakeLock();
  });
  $$('[data-edit]', el).forEach(b => b.onclick = () => openFakeModal(DB.fakeMaps.find(m => m.id === b.dataset.edit)));
  /* 行内编辑：双击任意内容单元格 → 输入控件 → 回车/失焦保存 */
  $$('.editable', el).forEach(td => td.ondblclick = () => {
    if (!can('editAll')) { toast('当前角色无编辑权限', 'warn'); return; }
    if (td.querySelector('input, select')) return;
    const rec = DB.fakeMaps.find(m => m.id === td.dataset.id);
    if (!rec) return;
    const field = td.dataset.field;
    const type = td.dataset.type || 'text';
    const cur = rec[field];
    let ctrl;
    if (type === 'select') {
      const opts = [...new Set((DB.fakeMaps || []).map(x => x.series))];
      ctrl = `<select class="cell-input">${opts.map(s => `<option ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__new">＋ 新系列…</option></select>`;
    } else if (type === 'owner') {
      const owners = (STRUCT_FIELDS.find(x => x.k === 'owner') || {}).options || [];
      ctrl = `<select class="cell-input">${owners.map(o => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}<option value="__new">＋ 新负责人…</option></select>`;
    } else if (type === 'reals') {
      ctrl = `<input class="cell-input" style="width:220px" value="${esc((cur || []).join(', '))}" placeholder="多个型号用逗号分隔">`;
    } else if (type === 'number') {
      ctrl = `<input class="cell-input" type="number" step="0.01" min="0" value="${cur ?? ''}">`;
    } else {
      ctrl = `<input class="cell-input" value="${esc(cur || '')}">`;
    }
    td.innerHTML = ctrl;
    const input = td.querySelector('input, select');
    input.focus();
    if (input.select) input.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = input.value;
      /* 下拉选了「＋ 新…」→ 原地变文本输入继续编辑 */
      if ((type === 'select' || type === 'owner') && v === '__new') {
        td.innerHTML = `<input class="cell-input" placeholder="输入新系列名称">`;
        const ni = td.querySelector('input');
        ni.focus();
        let d2 = false;
        const commit2 = () => {
          if (d2) return; d2 = true;
          const nv = ni.value.trim();
          if (nv) { rec[field] = nv; saveDB(); renderFakeLock(); toast('已保存（自动同步云端）', 'ok'); }
          else renderFakeLock();
        };
        ni.onblur = commit2;
        ni.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit2(); } else if (e.key === 'Escape') { d2 = true; renderFakeLock(); } };
        return;
      }
      if (type === 'number') rec[field] = v === '' ? null : Number(v);
      else if (type === 'reals') rec[field] = v.split(/[,\n，、]/).map(s => s.trim()).filter(Boolean);
      else if (field === 'model' && !v.trim()) { toast('型号不能为空', 'warn'); renderFakeLock(); return; }
      else rec[field] = v.trim();
      saveDB(); renderFakeLock();
      toast('已保存（自动同步云端）', 'ok');
    };
    input.onblur = commit;
    input.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; renderFakeLock(); }
    };
  });
  $$('[data-del]', el).forEach(b => b.onclick = () => {
    if (!confirm('确认删除该假锁映射？')) return;
    DB.fakeMaps = DB.fakeMaps.filter(m => m.id !== b.dataset.del);
    saveDB(); renderFakeLock(); renderNav(); toast('已删除', 'ok');
  });
  const addBtn = $('[data-act="addMap"]', el);
  if (addBtn) addBtn.onclick = () => openFakeModal(null);
}

function openFakeModal(m) {
  const isNew = !m;
  const d = m || { series: '', sku: '', model: '', reals: [], priceNormal: null, priceEcom: null, priceOffline: null, owner: '' };
  const OWNER_OPTS = (STRUCT_FIELDS.find(x => x.k === 'owner') || {}).options || [];
  const modal = $('#modalMask'), box = $('#modalBox');
  box.className = 'modal';
  box.innerHTML = `
    <div class="modal-head"><h2>${isNew ? '＋ 新建映射' : '编辑假锁映射'}</h2><button class="close">✕</button></div>
    <div class="modal-body">
      <div class="notice info">一个假锁（演示/陈列锁）型号可对应多个真锁型号；价格为假锁本身的价格体系。</div>
      <div class="form-grid">
        <div class="form-item"><label>产品系列 <span class="req">*</span></label>
          <select id="fkF-series">${[...new Set((DB.fakeMaps || []).map(x => x.series))].map(s => `<option ${d.series === s ? 'selected' : ''}>${s}</option>`).join('')}<option value="__new">＋ 新系列…</option></select></div>
        <div class="form-item" id="fkF-newSeriesWrap" style="display:none"><label>新系列名称 <span class="req">*</span></label><input id="fkF-newSeries" placeholder="如 K系列"></div>
        <div class="form-item"><label>假锁型号 <span class="req">*</span></label><input id="fkF-model" value="${esc(d.model)}" placeholder="如 K80"></div>
        <div class="form-item"><label>假锁SKU</label><input id="fkF-sku" value="${esc(d.sku || '')}" placeholder="如 123110"></div>
        <div class="form-item form-full"><label>通用真锁型号（多个用逗号或换行分隔）</label><input id="fkF-reals" value="${esc(d.reals.join(', '))}" placeholder="如 K80, K80Pro"></div>
        <div class="form-item"><label>日常价</label><input id="fkF-normal" type="number" step="0.01" min="0" value="${d.priceNormal ?? ''}"></div>
        <div class="form-item"><label>电商分销价</label><input id="fkF-ecom" type="number" step="0.01" min="0" value="${d.priceEcom ?? ''}"></div>
        <div class="form-item"><label>线下供货价</label><input id="fkF-offline" type="number" step="0.01" min="0" value="${d.priceOffline ?? ''}"></div>
        <div class="form-item"><label>负责人</label><select id="fkF-owner"><option value="">未指定</option>${OWNER_OPTS.map(o => `<option ${d.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-x="cancel">取消</button>
      <button class="btn primary" data-x="save">保存</button>
    </div>`;
  modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  $('.close', box).onclick = close;
  $('[data-x="cancel"]', box).onclick = close;
  $('#fkF-series', box).addEventListener('change', e => { $('#fkF-newSeriesWrap', box).style.display = e.target.value === '__new' ? '' : 'none'; });
  $('[data-x="save"]', box).onclick = () => {
    let series = $('#fkF-series', box).value;
    if (series === '__new') series = $('#fkF-newSeries', box).value.trim();
    const model = $('#fkF-model', box).value.trim();
    if (!series || !model) { toast('系列与假锁型号为必填项', 'warn'); return; }
    const reals = $('#fkF-reals', box).value.split(/[,\n，、]/).map(s => s.trim()).filter(Boolean);
    const num = id => { const v = $(id, box).value; return v === '' ? null : Number(v); };
    if (isNew) {
      DB.fakeMaps.push({ id: uid(), series, sku: $('#fkF-sku', box).value.trim(), model, reals, priceNormal: num('#fkF-normal'), priceEcom: num('#fkF-ecom'), priceOffline: num('#fkF-offline'), owner: $('#fkF-owner', box).value });
    } else {
      Object.assign(m, { series, sku: $('#fkF-sku', box).value.trim(), model, reals, priceNormal: num('#fkF-normal'), priceEcom: num('#fkF-ecom'), priceOffline: num('#fkF-offline'), owner: $('#fkF-owner', box).value });
    }
    saveDB(); close(); renderFakeLock(); renderNav();
    toast(isNew ? '映射已创建' : '映射已更新', 'ok');
  };
}

/* =========================================================
 * 配件定价：4 张价格表（把手款/全自动/高端款/锁体及边条）
 * ======================================================= */
let accState = { table: '', cat: '' };
const ACC_TABLES = ['把手款通用配件', '全自动通用配件', '高端款(K77/K10)配件', '锁体及边条'];
const CAT_CHIP = { '电子件': 'cat-e', '外观件': 'cat-v', '结构件': 'cat-b', '其他': 'cat-m' };
const catChip = (c) => c && c !== '—'
  ? `<span class="chip-cat ${CAT_CHIP[c] || ''}">${esc(c)}</span>`
  : '<span style="color:var(--muted)">—</span>';
const tableChip = (t) => `<span class="chip-table">${esc(t)}</span>`;

function renderAccessories() {
  const el = $('#view-accessories');
  const all = DB.accessories || [];
  const cats = [...new Set(all.map(a => a.cat).filter(c => c && c !== '—'))];
  const rows = all.filter(a => (!accState.table || a.table === accState.table) && (!accState.cat || a.cat === accState.cat));
  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>配件定价</h1>
        <div class="sub">${PAGE_SUBS.accessories} · 共 ${rows.length} 项</div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="addAcc" ${can('editAll') ? '' : 'disabled title="无权限"'}>＋ 新增配件</button>
      </div>
    </div>
    <div class="toolbar">
      <select id="accCat"><option value="">全部类型</option>${cats.map(c => `<option ${accState.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <select id="accTable"><option value="">全部价格表</option>${ACC_TABLES.map(t => `<option ${accState.table === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span class="spacer"></span>
      <span class="count-tip">共 ${rows.length} 项</span>
    </div>
    <div class="table-wrap">
      <table class="list acc-table"><thead><tr>
        <th>价格表</th><th>类别</th><th>配件名称</th><th>单位</th><th>定价价格</th>${can('view') ? '<th style="width:70px">操作</th>' : ''}
      </tr></thead><tbody>
      ${rows.map(a => `
        <tr data-id="${a.id}">
          <td>${tableChip(a.table)}</td>
          <td>${catChip(a.cat)}</td>
          <td><span class="model">${esc(a.name)}</span></td>
          <td style="color:var(--muted)">${esc(a.unit || '—')}</td>
          <td class="price">${fmtPrice(a.retail)}</td>
          ${can('editAll') ? `<td><button class="link-btn" data-acc-edit="${a.id}">编辑</button></td>` : ''}
        </tr>`).join('')}
      ${rows.length ? '' : '<tr><td colspan="6" style="text-align:center;padding:48px 0;color:var(--muted)">暂无配件 · 点击右上角「新增配件」添加</td></tr>'}
      </tbody></table>
    </div>`;
  $('#accCat', el).addEventListener('change', e => { accState.cat = e.target.value; renderAccessories(); });
  $('#accTable', el).addEventListener('change', e => { accState.table = e.target.value; renderAccessories(); });
  const addBtn = $('[data-act="addAcc"]', el);
  if (addBtn) addBtn.onclick = () => can('editAll') ? openAccModal(null) : toast('当前角色无编辑权限', 'err');
  $$('[data-acc-edit]', el).forEach(b => b.onclick = () => openAccModal(DB.accessories.find(a => a.id === b.dataset.accEdit)));
}

function openAccModal(a) {
  const isNew = !a;
  const d = a || { table: ACC_TABLES[0], cat: '', name: '', unit: '', supply: null, retail: null };
  const modal = $('#modalMask'), box = $('#modalBox');
  box.className = 'modal';
  box.innerHTML = `
    <div class="modal-head"><h2>${isNew ? '＋ 新增配件' : '编辑配件'}</h2><button class="close">✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-item"><label>价格表 <span class="req">*</span></label>
          <select id="acF-table">${ACC_TABLES.map(t => `<option ${d.table === t ? 'selected' : ''}>${t}</option>`).join('')}<option value="__new">＋ 新价格表…</option></select></div>
        <div class="form-item" id="acF-newTableWrap" style="display:none"><label>新价格表名称 <span class="req">*</span></label><input id="acF-newTable"></div>
        <div class="form-item"><label>类别</label><input id="acF-cat" value="${esc(d.cat === '—' ? '' : (d.cat || ''))}" placeholder="如 电子件 / 外观件 / 结构件" list="acCatList"><datalist id="acCatList"><option>电子件</option><option>外观件</option><option>结构件</option><option>其他</option></datalist></div>
        <div class="form-item"><label>单位</label><input id="acF-unit" value="${esc(d.unit === '—' ? '' : (d.unit || ''))}" placeholder="如 个 / 套 / 块"></div>
        <div class="form-item form-full"><label>配件名称 <span class="req">*</span></label><input id="acF-name" value="${esc(d.name)}"></div>
        <div class="form-item"><label>定价价格（建议零售价） <span class="req">*</span></label><input id="acF-retail" type="number" step="0.01" min="0" value="${d.retail ?? ''}"></div>
        <div class="form-item"><label>供货价</label><input id="acF-supply" type="number" step="0.01" min="0" value="${d.supply ?? ''}"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-x="cancel">取消</button>
      <button class="btn primary" data-x="save">保存</button>
    </div>`;
  modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  $('.close', box).onclick = close;
  $('[data-x="cancel"]', box).onclick = close;
  $('#acF-table', box).addEventListener('change', e => { $('#acF-newTableWrap', box).style.display = e.target.value === '__new' ? '' : 'none'; });
  $('[data-x="save"]', box).onclick = () => {
    let table = $('#acF-table', box).value;
    if (table === '__new') table = $('#acF-newTable', box).value.trim();
    const name = $('#acF-name', box).value.trim();
    const retail = $('#acF-retail', box).value;
    if (!table || !name) { toast('价格表与配件名称为必填项', 'warn'); return; }
    if (!ACC_TABLES.includes(table)) ACC_TABLES.push(table);
    const numv = id => { const v = $(id, box).value; return v === '' ? null : Number(v); };
    const rec = {
      table, cat: $('#acF-cat', box).value.trim() || '—',
      name, unit: $('#acF-unit', box).value.trim() || '—',
      retail: retail === '' ? null : Number(retail), supply: numv('#acF-supply'),
    };
    if (isNew) DB.accessories.push({ id: uid(), ...rec });
    else Object.assign(a, rec);
    saveDB(); close(); renderAccessories(); renderNav();
    toast(isNew ? '配件已添加' : '配件已更新', 'ok');
  };
}


/* =========================================================
 * 看板
 * ======================================================= */
function statOf(list) {
  const total = list.length;
  const normal = list.filter(p => p.fields.status === '正常').length;
  const off = list.filter(p => /下市/.test(p.fields.status || '')).length;
  const pend = list.filter(p => p.recordStatus === 'pending').length;
  const comp = total ? Math.round(list.reduce((a, p) => a + completeness(p), 0) / total) : 0;
  return { total, normal, off, pend, comp };
}
function completeness(p) {
  const req = STRUCT_FIELDS.filter(f => f.required);
  const done = req.filter(f => p.fields[f.k] !== undefined && p.fields[f.k] !== '').length + Object.values(p.custom).filter(v => v).length;
  const all = req.length + DB.customFields.filter(c => c.required).length;
  return Math.round(Math.min(1, done / Math.max(all, 1)) * 100);
}
function renderDashboard() {
  const el = $('#view-dashboard');
  const s = statOf(DB.products);
  const series = {};
  DB.products.forEach(p => { const k = p.fields.series || '未分类'; series[k] = (series[k] || 0) + 1; });
  const recent = [...DB.products].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 8);
  el.innerHTML = `
    <div class="page-head"><div><h1>总览</h1><div class="sub">产品总数、状态分布、资料完整度与更新动态一览</div></div>
      <div class="actions"><button class="btn" data-act="exportAll">导出全部</button></div></div>
    <div class="stat-grid">
      <div class="card stat-card"><div class="label">产品总数</div><div class="value">${s.total}</div><div class="delta">含全部渠道与系列</div></div>
      <div class="card stat-card"><div class="label">在售（正常）</div><div class="value" style="color:var(--green)">${s.normal}</div><div class="delta">占比 ${s.total ? Math.round(s.normal / s.total * 100) : 0}%</div></div>
      <div class="card stat-card"><div class="label">已下市 / 预下市</div><div class="value" style="color:var(--muted)">${s.off}</div><div class="delta">关注清库与替换机型</div></div>
      <div class="card stat-card"><div class="label">待审核</div><div class="value" style="color:var(--orange)">${s.pend}</div><div class="delta">需审核者处理</div></div>
      <div class="card stat-card"><div class="label">平均资料完整度</div><div class="value" style="color:var(--accent)">${s.comp}%</div><div class="delta">必填字段填写比例</div></div>
    </div>
    <div class="chart-row">
      <div class="card chart-card"><h3>产品状态分布</h3>${barChart(statusDist())}</div>
      <div class="card chart-card"><h3>系列分布</h3>${barChart(Object.entries(series).map(([k, v]) => [k, v]))}</div>
    </div>
    <div class="card chart-card"><h3>最近更新</h3>
      <div class="q-list">${recent.map(p => `
        <div class="q-row" data-id="${p.id}"><span class="tag accent">${esc(p.fields.series || '—')}</span>
          <b>${esc(p.fields.model)}</b><span style="color:var(--muted);font-size:.8rem">${esc(p.fields.status || '')}</span>
          <span class="cnt">${esc(p.updatedAt)} · ${esc(p.updatedBy)}</span></div>`).join('') || '<div class="empty-tip">暂无数据</div>'}
      </div></div>`;
  el.querySelector('[data-act="exportAll"]').onclick = () => exportExcel(DB.products, '产品库全量导出');
  $$('.q-row[data-id]', el).forEach(r => r.onclick = () => openDrawer(r.dataset.id));
}

function statusDist() {
  const map = {};
  DB.products.forEach(p => { const k = p.fields.status || '未填写'; map[k] = (map[k] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}
function barChart(data) {
  if (!data.length) return '<div class="empty-tip">暂无数据</div>';
  const max = Math.max(...data.map(d => d[1]));
  const colors = ['#3b5bfd', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#64748b', '#0ea5e9'];
  const bars = data.map((d, i) => {
    const w = Math.max(4, d[1] / max * 100);
    return `<g transform="translate(0,${i * 26})">
      <text x="0" y="15" font-size="11" fill="#6b7688">${esc(String(d[0]).slice(0, 9))}</text>
      <rect x="96" y="4" width="${w * 2.1}" height="14" rx="4" fill="${colors[i % colors.length]}"></rect>
      <text x="${96 + w * 2.1 + 6}" y="15" font-size="11" fill="#1e2532" font-weight="600">${d[1]}</text></g>`;
  }).join('');
  const width = Math.max(420, 96 + max * 2.1 + 40);
  return `<svg viewBox="0 0 ${width} ${data.length * 26}" role="img">${bars}</svg>`;
}

/* =========================================================
 * 产品库：列表 / 搜索 / 筛选
 * ======================================================= */
let listState = { q: '', scope: null, filters: { series: '', status: '', channel: '', owner: '', recordStatus: '', minPrice: '', maxPrice: '' }, sort: 'launchDate', dir: -1, page: 1, perPage: 15 };

function allTags() { const t = new Set(); DB.products.forEach(p => p.tags.forEach(x => t.add(x))); return [...t]; }

function applySearch(list) {
  const q = listState.q.trim().toLowerCase();
  let out = list.filter(p => {
    const f = listState.filters;
    if (listState.scope && !listState.scope.includes(p.fields.series)) return false;
    if (f.series && p.fields.series !== f.series) return false;
    if (f.status && p.fields.status !== f.status) return false;
    if (f.channel && p.fields.channel !== f.channel) return false;
    if (f.owner && p.fields.owner !== f.owner) return false;
    if (f.recordStatus && p.recordStatus !== f.recordStatus) return false;
    const pr = Number(p.fields.priceNormal);
    if (f.minPrice !== '' && !(pr >= Number(f.minPrice))) return false;
    if (f.maxPrice !== '' && pr && !(pr <= Number(f.maxPrice))) return false;
    if (!q) return true;
    const hay = [
      ...FIELD_KEYS.map(k => p.fields[k]), ...Object.values(p.custom), ...p.tags,
      stripHtml(p.description),
      ...p.comments.map(c => c.text + ' ' + c.author),
      ...p.attachments.map(a => a.name + ' ' + (a.text || '') + ' ' + (a.note || '')),
      p.updatedBy,
    ].filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every(t => hay.includes(t));
  });
  const key = listState.sort, dir = listState.dir;
  out.sort((a, b) => {
    let va = a.fields[key] ?? a[key] ?? '', vb = b.fields[key] ?? b[key] ?? '';
    if (typeof va === 'number' || (va !== '' && !isNaN(va) && key.startsWith('price'))) { va = Number(va) || 0; vb = Number(vb) || 0; return (va - vb) * dir; }
    return String(va).localeCompare(String(vb), 'zh') * dir;
  });
  return out;
}
const stripHtml = (h) => String(h || '').replace(/<[^>]+>/g, ' ');

function highlight(text, q) {
  const s = String(text ?? '');
  if (!q || !s) return esc(s);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let html = esc(s);
  terms.forEach(t => { html = html.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
  return html;
}

function statusBadge(st) {
  const cls = STATUS_CLASS[st] || (/下市|下架/.test(st) ? 'st-off' : /预|转/.test(st) ? 'st-pre-off' : 'st-normal');
  return `<span class="badge-st ${cls}"><i class="dot"></i>${esc(st || '未填写')}</span>`;
}
const CATEGORY_BY_SERIES = { '玄武': '智能锁', '麒麟': '智能锁', '大圣': '智能锁', '小嘀': '智能锁', '假锁': '智能锁', '保险柜': '智能保管柜', '配件': '配件' };
const catOf = (series) => CATEGORY_BY_SERIES[series] || '智能锁';
function recBadge(st) {
  const map = { published: '已发布', draft: '草稿', pending: '待审核', rejected: '已驳回' };
  return `<span class="badge-rec ${st}">${map[st] || st}</span>`;
}
function compBar(p) {
  const c = completeness(p);
  const color = c >= 80 ? 'var(--green)' : c >= 50 ? 'var(--orange)' : 'var(--red)';
  return `<span class="completeness"><span class="bar"><i style="width:${c}%;background:${color}"></i></span><span class="pct">${c}%</span></span>`;
}

function renderProducts() {
  const el = $('#view-products');
  const f = listState.filters;
  const results = applySearch(DB.products);
  const totalPages = Math.max(1, Math.ceil(results.length / listState.perPage));
  listState.page = Math.min(listState.page, totalPages);
  const pageItems = results.slice((listState.page - 1) * listState.perPage, listState.page * listState.perPage);

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${PAGE_TITLES[currentView] || '产品中心'}</h1>
        <div class="sub">${PAGE_SUBS[currentView] || PAGE_SUBS.products} · 共 ${results.length} 款</div>
      </div>
      <div class="actions">
        <button class="btn" data-act="export" ${results.length ? '' : 'disabled'}>导出结果</button>
        <button class="btn primary" data-act="add" ${can('create') ? '' : 'disabled'}>＋ 新建产品</button>
      </div>
    </div>
    <div class="toolbar">
      <input type="text" id="qInput" placeholder="本页搜索：型号/标签/评论…" value="${esc(listState.q)}" style="min-width:200px">
      <select id="fSeries"><option value="">全部系列</option>${(NAVS.find(n => n.id === currentView)?.scope || LOCK_SERIES).map(o => `<option ${f.series === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <select id="fChannel"><option value="">全部品类 / 渠道</option>${STRUCT_FIELDS.find(x => x.k === 'channel').options.map(o => `<option ${f.channel === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <select id="fStatus"><option value="">全部状态</option>${STRUCT_FIELDS.find(x => x.k === 'status').options.map(o => `<option ${f.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <select id="fOwner"><option value="">全部负责人</option>${STRUCT_FIELDS.find(x => x.k === 'owner').options.map(o => `<option ${f.owner === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <select id="sortSel">
        <option value="updatedAt:-1" ${listState.sort === 'updatedAt' && listState.dir === -1 ? 'selected' : ''}>最近更新</option>
        <option value="model:1" ${listState.sort === 'model' && listState.dir === 1 ? 'selected' : ''}>型号 A→Z</option>
        <option value="pricePubDaily:-1" ${listState.sort === 'pricePubDaily' && listState.dir === -1 ? 'selected' : ''}>普惠价 高→低</option>
        <option value="pricePubDaily:1" ${listState.sort === 'pricePubDaily' && listState.dir === 1 ? 'selected' : ''}>普惠价 低→高</option>
        <option value="launchDate:-1" ${listState.sort === 'launchDate' && listState.dir === -1 ? 'selected' : ''}>上市时间 新→旧</option>
      </select>
      <span class="spacer"></span>
      <button class="btn sm" data-act="saveFilter" title="保存当前筛选条件">保存筛选</button>
      <span class="count-tip">共 ${results.length} 款</span>
    </div>
    <div class="chip-row" id="chipRow"></div>
    <div class="table-wrap">
      <table class="list"><thead>
        <tr class="group-row">
          <th rowspan="2" class="sortable" data-k="model">型号 ⇅</th><th rowspan="2">系列</th><th rowspan="2">品类</th><th rowspan="2">状态</th>
          <th colspan="2">日常-无会员券</th>
          <th rowspan="2">渠道</th><th rowspan="2" class="sortable" data-k="launchDate">上市时间</th><th rowspan="2">记录状态</th><th rowspan="2" class="sortable" data-k="updatedAt">更新 ⇅</th><th rowspan="2">操作</th>
        </tr>
        <tr>
          <th class="sortable" data-k="pricePubDaily">普惠价 ⇅</th><th class="sortable" data-k="pricePubSubsidy">国补后到手（15%）</th>
        </tr>
      </thead><tbody>
      ${pageItems.map(p => `<tr data-id="${p.id}">
        <td><span class="model">${highlight(p.fields.model, listState.q)}</span>${p.recordStatus !== 'published' ? `<div class="sub-line">${recBadge(p.recordStatus)}</div>` : ''}</td>
        <td>${highlight(p.fields.series, listState.q) ? esc(p.fields.series) : '—'}</td>
        <td style="color:var(--muted)">${esc(p.fields.category || catOf(p.fields.series))}</td>
        <td>${statusBadge(p.fields.status)}</td>
        <td class="price ${p.fields.pricePubDaily ? '' : 'empty'}">${p.fields.pricePubDaily ? fmtMoney(p.fields.pricePubDaily) : '—'}</td>
        <td class="price ${p.fields.pricePubSubsidy ? '' : 'empty'}">${p.fields.pricePubSubsidy ? fmtMoney(p.fields.pricePubSubsidy) : '—'}</td>
        <td style="color:var(--muted)">${esc(p.fields.channel || '—')}</td>
        <td style="color:var(--muted)">${p.fields.launchDate ? esc(String(p.fields.launchDate).slice(0, 7)) : '—'}</td>
        <td>${p.recordStatus === 'published' ? '<span style="color:var(--muted);font-size:.8rem">已发布</span>' : recBadge(p.recordStatus)}</td>
        <td style="color:var(--muted);font-size:.8rem">${esc((p.updatedAt || '').slice(5))}</td>
        <td><button class="link-btn" data-open="${p.id}">详情</button></td>
      </tr>`).join('')}
      ${pageItems.length ? '' : `<tr><td colspan="11" style="text-align:center;padding:48px 0;color:var(--muted)">该系列暂无产品 · 可点击右上角「新建产品」手动填入，或在「导入识别」中批量导入</td></tr>`}
      </tbody></table>
      <div class="table-foot">
        <span>共 ${results.length} 条 · 第 ${listState.page}/${totalPages} 页</span>
        <span class="pager" id="pager"></span>
      </div>
    </div>`;

  // 交互绑定
  const qInput = $('#qInput', el);
  qInput.addEventListener('input', debounce(() => { listState.q = qInput.value; listState.page = 1; listState._focusQ = true; renderProducts(); renderSuggest(); }, 300));
  if (listState._focusQ) { requestAnimationFrame(() => { qInput.focus(); qInput.setSelectionRange(qInput.value.length, qInput.value.length); }); listState._focusQ = false; }
  [['fSeries', 'series'], ['fStatus', 'status'], ['fChannel', 'channel'], ['fOwner', 'owner']].forEach(([id, k]) => {
    $(`#${id}`, el).addEventListener('change', (e) => { listState.filters[k] = e.target.value; listState.page = 1; renderProducts(); });
  });
  $('#sortSel', el).addEventListener('change', e => { const [k, d] = e.target.value.split(':'); listState.sort = k; listState.dir = Number(d); renderProducts(); });
  $$('th.sortable', el).forEach(th => th.onclick = () => { const k = th.dataset.k; listState.dir = listState.sort === k ? -listState.dir : 1; listState.sort = k; renderProducts(); });
  $$('[data-open]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); openDrawer(b.dataset.open); });
  $$('tbody tr', el).forEach(tr => tr.onclick = () => openDrawer(tr.dataset.id));
  el.querySelector('[data-act="add"]').onclick = () => can('create') ? openEditor(null) : toast('当前角色无新增权限', 'err');
  el.querySelector('[data-act="export"]').onclick = () => exportExcel(results, '产品库搜索结果导出');
  el.querySelector('[data-act="saveFilter"]').onclick = () => {
    if (!can('comment')) return toast('当前角色无此权限', 'err');
    const name = prompt('给这组筛选条件起个名字：', `筛选${DB.savedFilters.length + 1}`);
    if (!name) return;
    DB.savedFilters.push({ id: uid(), name, state: JSON.parse(JSON.stringify(listState)) });
    saveDB(); toast('已保存常用筛选', 'ok'); renderChips();
  };
  renderChips();

  const pager = $('#pager', el);
  let ph = '';
  const addBtn = (label, pg, cur) => ph += `<button class="${cur ? 'cur' : ''}" data-p="${pg}">${label}</button>`;
  if (totalPages > 1) {
    addBtn('‹', Math.max(1, listState.page - 1), false);
    for (let i = 1; i <= totalPages; i++) { if (i === 1 || i === totalPages || Math.abs(i - listState.page) <= 2) addBtn(i, i, i === listState.page); else if (ph.endsWith('…') === false) ph += '…'; }
    addBtn('›', Math.min(totalPages, listState.page + 1), false);
  }
  pager.innerHTML = ph;
  $$('#pager button', el).forEach(b => b.onclick = () => { listState.page = Number(b.dataset.p); renderProducts(); });

  function renderChips() {
    const row = $('#chipRow', el); if (!row) return;
    row.innerHTML = DB.savedFilters.map(sf =>
      `<button class="chip" data-sf="${sf.id}">${esc(sf.name)} <span class="x">✕</span></button>`).join('');
    $$('.chip', row).forEach(c => c.onclick = (e) => {
      const sf = DB.savedFilters.find(x => x.id === c.dataset.sf);
      if (e.target.classList.contains('x')) { DB.savedFilters = DB.savedFilters.filter(x => x !== sf); saveDB(); renderProducts(); return; }
      listState = JSON.parse(JSON.stringify(sf.state)); renderProducts();
    });
  }
}

/* -------- 全局搜索建议 & 历史 -------- */
function renderSuggest() {
  const pop = $('#suggestPop'), input = $('#globalSearch');
  const q = input.value.trim().toLowerCase();
  let html = '';
  if (!q && DB.searchHistory.length) {
    html += '<div class="s-head">历史搜索</div>' + DB.searchHistory.map(h =>
      `<div class="s-item" data-h="${esc(h)}"><span class="hist">${esc(h)}</span></div>`).join('');
  }
  if (q) {
    const hits = DB.products.filter(p => (p.fields.model || '').toLowerCase().includes(q) || (p.fields.series || '').toLowerCase().includes(q)).slice(0, 7);
    html += '<div class="s-head">产品建议</div>' + (hits.map(p =>
      `<div class="s-item" data-id="${p.id}"><span class="tag accent">${esc(p.fields.series || '')}</span> <b>${highlight(p.fields.model, q)}</b><span style="margin-left:auto;color:var(--muted);font-size:.78rem">${fmtMoney(p.fields.priceNormal)}</span></div>`).join('') || '<div class="s-item">未找到匹配产品，回车进行全文搜索</div>');
  }
  pop.innerHTML = html || '';
  pop.classList.toggle('open', !!html);
  $$('.s-item[data-id]', pop).forEach(i => i.onclick = () => { pop.classList.remove('open'); openDrawer(i.dataset.id); });
  $$('.s-item[data-h]', pop).forEach(i => i.onclick = () => { input.value = i.dataset.h; doGlobalSearch(); });
}
function doGlobalSearch() {
  const q = $('#globalSearch').value.trim();
  if (!q) return;
  DB.searchHistory = [q, ...DB.searchHistory.filter(h => h !== q)].slice(0, 8);
  saveDB();
  listState.q = q; listState.page = 1; listState.filters = { series: '', status: '', channel: '', owner: '', recordStatus: '', minPrice: '', maxPrice: '' };
  go('products');
  $('#suggestPop').classList.remove('open');
}

/* =========================================================
 * 详情抽屉
 * ======================================================= */
let drawerPid = null, drawerTab = 'info';
/* 详情抽屉「电商价格」表行内编辑：双击单元格原地改，保存并记版本 */
function editDrawerCell(td, p) {
  if (td.querySelector('input,select,textarea')) return;
  const k = td.dataset.k, type = td.dataset.type;
  const oldVal = k === '__channel' ? (p.fields.channel || '') : (p.fields[k] ?? '');
  const multi = k === 'promoNote'; /* 备注多行编辑：Enter 换行，Ctrl+Enter 保存 */
  const input = document.createElement(multi ? 'textarea' : 'input');
  input.className = 'cell-input';
  if (multi) { input.rows = 3; input.placeholder = 'Enter 换行，Ctrl+Enter 保存'; }
  else {
    input.type = type === 'num' ? 'number' : 'text';
    if (type === 'num') { input.step = '0.01'; input.min = '0'; }
  }
  input.value = oldVal === null || oldVal === undefined ? '' : oldVal;
  td.innerHTML = ''; td.appendChild(input);
  input.focus(); input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return; done = true;
    let v = input.value.trim();
    if (type === 'num') {
      if (v === '') v = null;
      else { v = Number(v); if (isNaN(v) || v < 0) { renderDrawer(); toast('请输入有效的非负价格', 'err'); return; } }
    }
    if (!commit || String(oldVal ?? '') === String(v ?? '')) { renderDrawer(); return; }
    const newFields = JSON.parse(JSON.stringify(p.fields));
    if (k === '__channel') newFields.channel = v; else newFields[k] = v;
    const changes = diffFields(p.fields, newFields);
    p.fields = newFields;
    p.updatedAt = now(); p.updatedBy = ME.name;
    if (changes.length) p.versions.unshift({ id: uid(), at: now(), by: ME.name, note: '行内修改', snapshot: JSON.parse(JSON.stringify(newFields)), changes });
    notifySubscribers(p, `${ME.name} 行内修改了 ${p.fields.model}`);
    saveDB(); toast('已保存', 'ok'); renderDrawer(); renderNav();
  };
  input.onblur = () => finish(true);
  input.onkeydown = (e) => {
    if (e.key === 'Escape') { finish(false); }
    else if (e.key === 'Enter') {
      if (multi) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); finish(true); } }
      else finish(true);
    }
  };
}

function openDrawer(id, tab = 'info') {  drawerPid = id; drawerTab = tab;
  renderDrawer();
  $('#drawerMask').classList.add('open');
  $('#drawer').classList.add('open');
}
function closeDrawer() {
  $('#drawerMask').classList.remove('open');
  $('#drawer').classList.remove('open');
}
function renderDrawer() {
  const p = DB.products.find(x => x.id === drawerPid);
  if (!p) return closeDrawer();
  const f = p.fields;
  const isMine = p.fields.owner === ME.name || p.updatedBy === ME.name;
  const canEdit = can('editAll') || (can('editOwn') && (isMine || !f.owner));
  const sub = p.subscribers.includes(ME.name);

  $('#drawer').innerHTML = `
    <div class="drawer-head">
      <span class="tag accent">${esc(f.series || '—')}</span>
      <h2>${esc(f.model || '未命名产品')}</h2>
      ${recBadge(p.recordStatus)}
      <button class="close" title="关闭">✕</button>
    </div>
    <div class="drawer-tabs">
      <button data-t="info" class="${drawerTab === 'info' ? 'active' : ''}">概览</button>
      <button data-t="history" class="${drawerTab === 'history' ? 'active' : ''}">版本历史 (${p.versions.length})</button>
      <button data-t="collab" class="${drawerTab === 'collab' ? 'active' : ''}">协作 (${p.comments.length})</button>
    </div>
    <div class="drawer-body" id="drawerBody"></div>`;

  $('.drawer-head .close').onclick = closeDrawer;
  $$('.drawer-tabs button').forEach(b => b.onclick = () => { drawerTab = b.dataset.t; renderDrawer(); });

  const body = $('#drawerBody');
  if (drawerTab === 'info') {
    const customHtml = DB.customFields.filter(cf => cf.applies === 'all' || cf.applies === f.series).map(cf => {
      const v = p.custom[cf.id];
      return `<div class="f-item"><div class="f-label">${esc(cf.label)}${cf.required ? ' *' : ''}</div><div class="f-value ${v ? '' : 'empty'}">${esc(Array.isArray(v) ? v.join('、') : (v || '未填写'))}</div></div>`;
    }).join('');
    body.innerHTML = `
      <div class="sub-banner">
        <span>完整度 ${completeness(p)}%</span> · <span>负责人：${esc(f.owner || '未指定')}</span> · <span>更新于 ${esc(p.updatedAt)} by ${esc(p.updatedBy)}</span>
        <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          ${canEdit ? `<button class="btn sm primary" data-op="edit">编辑</button>` : ''}
          ${can('comment') ? `<button class="btn sm" data-op="sub">${sub ? '取消订阅' : '订阅变更'}</button>` : ''}
          ${can('delete') ? `<button class="btn sm danger" data-op="del">删除</button>` : ''}
        </span>
      </div>
      <div class="section-title">电商价格 <span class="hint">日常/活动 两档 · 可横向滚动查看</span></div>
      <div class="price-scroll"><table class="price-table promo">
        <thead>
          <tr class="group-row"><th class="ch" rowspan="2">销售渠道</th>${PROMO_GROUPS.map(g => `<th colspan="${g.cols.length}">${esc(g.name)}</th>`).join('')}</tr>
          <tr>${PROMO_GROUPS.map(g => g.cols.map(([k, th]) => `<th>${esc(th)}</th>`).join('')).join('')}</tr>
        </thead>
        <tbody><tr>
          <td class="ch${canEdit ? ' ed-cell' : ''}" data-k="__channel" data-type="text"${canEdit ? ' title="双击修改"' : ''}>${esc(f.channel || '—')}</td>
          ${PROMO_COLS.map(k => {
            const has = f[k] != null && f[k] !== '';
            return `<td class="num${has ? '' : ' empty'}${canEdit ? ' ed-cell' : ''}" data-k="${k}" data-type="num" title="${esc(FIELD_MAP[k])}${canEdit ? ' · 双击修改' : ''}">${has ? fmtMoney(f[k]) : '—'}</td>`;
          }).join('')}
        </tr>
        <tr><td class="ch">备注</td><td colspan="${PROMO_COLS.length}" class="note-cell${canEdit ? ' ed-cell' : ''}" data-k="promoNote" data-type="text"${canEdit ? ' title="双击修改；Enter 换行，Ctrl+Enter 保存"' : ''}>${f.promoNote ? esc(f.promoNote) : '<span class="empty">—</span>'}</td></tr></tbody>
      </table></div>
      <div class="section-title" style="margin-top:18px">发文价格 <span class="hint">${PRICE_KEYS.length} 项价格 · 可横向滚动查看</span></div>
      <div class="price-scroll"><table class="price-table">
        <thead><tr><th class="ch">销售渠道</th>${PRICE_KEYS.map(k => `<th>${esc(FIELD_MAP[k].replace(/（元）$/, ''))}</th>`).join('')}</tr></thead>
        <tbody><tr>
          <td class="ch">${esc(f.channel || '—')}</td>
          ${PRICE_KEYS.map(k => f[k] != null && f[k] !== '' ? `<td class="num" title="${esc(FIELD_MAP[k])}">${fmtMoney(f[k])}</td>` : `<td class="empty">—</td>`).join('')}
        </tr></tbody>
      </table></div>
      <div class="field-grid" style="margin-top:18px">
        ${STRUCT_FIELDS.filter(x => x.type !== 'number' && !x.promoGroup).map(x => `
          <div class="f-item"><div class="f-label">${x.label}${x.required ? ' *' : ''}</div>
          <div class="f-value ${f[x.k] ? '' : 'empty'}">${x.k === 'status' && f[x.k] ? statusBadge(f[x.k]) : esc(f[x.k] || '未填写')}</div></div>`).join('')}
      </div>
      ${DB.customFields.length ? `<div class="section-title">自定义字段 <span class="hint">按产品线配置</span></div><div class="field-grid">${customHtml || '<span style="color:var(--muted);font-size:.85rem">该系列暂无自定义字段</span>'}</div>` : ''}
      <div class="section-title">产品描述</div>
      <div class="desc-box">${p.description || '<span style="color:var(--muted)">未填写</span>'}</div>
      <div class="section-title">标签</div>
      <div>${p.tags.map(t => `<span class="tag accent">${esc(t)}</span>`).join('') || '<span style="color:var(--muted)">无</span>'}</div>
      <div class="section-title">附件（${p.attachments.length}）<span class="hint">规格书 / 认证 / 报价 / 图片 / 竞品资料</span></div>
      <div class="attach-list">${p.attachments.map(a => `
        <div class="attach-item">
          <div><div>${esc(a.name)}</div><div class="meta">${esc(a.cat)} · ${fmtSize(a.size)} · ${esc(a.date)} ${a.note ? '· ' + esc(a.note) : ''}</div></div>
          <div class="ops">${canEdit ? `<button class="btn sm danger" data-delatt="${a.id}">删除</button>` : ''}</div>
        </div>`).join('') || '<div class="empty-tip">暂无附件</div>'}</div>
      ${canEdit ? `<div style="margin-top:10px"><button class="btn sm" data-op="addatt">＋ 上传附件</button></div>` : ''}`;

    body.querySelector('[data-op="edit"]')?.addEventListener('click', () => openEditor(p));
    body.querySelector('[data-op="sub"]')?.addEventListener('click', () => {
      p.subscribers = sub ? p.subscribers.filter(n => n !== ME.name) : [...p.subscribers, ME.name];
      saveDB(); toast(sub ? '已取消订阅' : '已订阅该产品的变更通知', 'ok'); renderDrawer();
    });
    body.querySelector('[data-op="del"]')?.addEventListener('click', () => {
      if (confirm(`确认将「${f.model}」移入回收站？`)) { toBin(p); closeDrawer(); }
    });
    body.querySelector('[data-op="addatt"]')?.addEventListener('click', () => addAttachment(p));
    $$('[data-delatt]', body).forEach(b => b.onclick = () => {
      p.attachments = p.attachments.filter(a => a.id !== b.dataset.delatt);
      saveDB(); toast('附件已删除', 'ok'); renderDrawer();
    });
    /* 电商价格表行内编辑：双击单元格 → 输入框 → Enter/失焦保存 */
    if (canEdit) $$('.ed-cell', body).forEach(td => { td.ondblclick = () => editDrawerCell(td, p); });
  }
  if (drawerTab === 'history') {
    body.innerHTML = `<div class="notice info">每次编辑自动记录版本、修改人、时间与变更内容，支持对比与一键回滚；删除的产品会进入回收站。</div>` +
      p.versions.map((v, i) => `
        <div class="ver-item">
          <div class="v-head"><span class="ver-no">V${p.versions.length - i}</span>
            <span>${esc(v.at)}</span><span>${esc(v.by)}</span>
            ${v.note ? `<span class="tag">${esc(v.note)}</span>` : ''}
            <span class="ops">${i < p.versions.length - 1 && canEdit ? `<button class="btn sm" data-rollback="${v.id}">↩ 回滚到此版本</button>` : ''}</span>
          </div>
          ${v.changes && v.changes.length ? `<div class="ver-diff">${v.changes.map(c => `
            <div class="diff-row"><span class="df">${esc(c.label)}</span><span class="old">${esc(c.from ?? '空')}</span><span class="new">${esc(c.to ?? '空')}</span></div>`).join('')}</div>`
        : '<div class="ver-diff" style="color:var(--muted)">初始版本 / 无字段变更</div>'}
        </div>`).join('');
    $$('[data-rollback]', body).forEach(b => b.onclick = () => {
      const v = p.versions.find(x => x.id === b.dataset.rollback);
      if (!confirm('回滚将覆盖当前字段内容（会生成新版本记录），继续？')) return;
      const changes = diffFields(p.fields, v.snapshot);
      const newSnap = JSON.parse(JSON.stringify(v.snapshot));
      p.versions.unshift({ id: uid(), at: now(), by: ME.name, note: `回滚至 V${p.versions.length - p.versions.indexOf(v)}`, snapshot: newSnap, changes });
      p.fields = newSnap; p.updatedAt = now(); p.updatedBy = ME.name;
      notifySubscribers(p, `${ME.name} 将 ${p.fields.model} 回滚到历史版本`);
      saveDB(); toast('已回滚', 'ok'); renderDrawer(); renderNav();
    });
  }
  if (drawerTab === 'collab') {
    body.innerHTML = `
      <div class="sub-banner"><span>订阅者：${p.subscribers.map(esc).join('、') || '暂无'}</span>
        ${can('comment') ? `<button class="btn sm" data-op="sub2" style="margin-left:auto">${sub ? '取消订阅' : '订阅变更'}</button>` : ''}</div>
      ${p.comments.map(c => `
        <div class="comment-item">
          <div class="avatar" style="background:${avatarColor(c.author)}">${esc(c.author[0])}</div>
          <div class="c-body"><div class="c-meta"><b>${esc(c.author)}</b> · ${esc(c.at)}</div>
            <div class="c-text">${renderComment(c.text)}</div></div>
        </div>`).join('') || '<div class="empty-tip">还没有评论，来发起讨论吧</div>'}
      ${can('comment') ? `<div class="comment-box">
        <textarea id="cInput" placeholder="输入评论，@成员 可提醒对方（如 @张国焘）…"></textarea>
        <button class="btn primary" data-op="send">发送</button></div>` : '<div class="notice warn">查看者角色仅可浏览评论。</div>'}`;
    body.querySelector('[data-op="sub2"]')?.addEventListener('click', () => {
      p.subscribers = sub ? p.subscribers.filter(n => n !== ME.name) : [...p.subscribers, ME.name];
      saveDB(); renderDrawer();
    });
    body.querySelector('[data-op="send"]')?.addEventListener('click', () => {
      const ta = $('#cInput', body);
      const text = ta.value.trim();
      if (!text) return toast('请输入评论内容');
      p.comments.push({ id: uid(), author: ME.name, at: now(), text });
      const mentions = [...text.matchAll(/@([\u4e00-\u9fa5]{2,4})/g)].map(m => m[1]);
      mentions.forEach(name => {
        if (name !== ME.name) DB.todos.push({ id: uid(), for: name, text: `${ME.name} 在 ${p.fields.model} 中提到了你`, pid: p.id, at: now() });
      });
      notifySubscribers(p, `${ME.name} 评论了 ${p.fields.model}`);
      saveDB(); toast('评论已发送', 'ok'); renderDrawer();
    });
  }
}
function renderComment(t) {
  return esc(t).replace(/@([\u4e00-\u9fa5]{2,4})/g, '<span class="mention">@$1</span>');
}
function notifySubscribers(p, text) {
  p.subscribers.filter(n => n !== ME.name).forEach(n =>
    DB.todos.push({ id: uid(), for: n, text, pid: p.id, at: now() }));
}
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return '';
}
function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

/* -------- 附件上传（元数据演示） -------- */
function addAttachment(p) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg';
  input.onchange = () => {
    const files = [...input.files];
    if (!files.length) return;
    const cat = prompt('附件分类（规格书/认证证书/报价单/产品图片/竞品资料/其他）：', '规格书') || '其他';
    files.forEach(file => {
      if (file.size > 50 * 1048576) { toast(`${file.name} 超过 50MB 限制，已跳过`, 'err'); return; }
      p.attachments.push({ id: uid(), name: file.name, cat, size: file.size, type: file.type, date: now().slice(0, 10), note: '手动上传' });
    });
    logVersion(p, [], '上传附件');
    saveDB(); toast(`已添加 ${files.length} 个附件`, 'ok'); renderDrawer();
  };
  input.click();
}

/* =========================================================
 * 编辑器（新增/编辑 + 校验 + 审核）
 * ======================================================= */
function openEditor(p) {
  const isNew = !p;
  const f0 = isNew ? {} : JSON.parse(JSON.stringify(p.fields));
  const c0 = isNew ? {} : JSON.parse(JSON.stringify(p.custom));
  const d0 = isNew ? '<p></p>' : (p.description || '');
  const t0 = isNew ? [] : [...p.tags];
  const modal = $('#modalMask'), box = $('#modalBox');
  box.className = 'modal wide';
  const applicableCF = () => DB.customFields.filter(cf => cf.applies === 'all' || cf.applies === ($('#ed-series')?.value || f0.series));

  box.innerHTML = `
    <div class="modal-head"><h2>${isNew ? '新建产品' : '编辑：' + esc(f0.model || '')}</h2>
      <span style="color:var(--muted);font-size:.82rem;margin-left:10px">${isNew ? '上传文件自动生成，或手动自定义录入字段（生成后为草稿状态）' : (can('directPublish') ? '保存后直接发布' : '保存后提交审核者审核')}</span>
      <button class="close">✕</button></div>
    ${isNew ? `<div class="modal-tabs">
      <button class="mtab active" data-tab="upload">上传文件自动生成</button>
      <button class="mtab" data-tab="form">自定义录入 / 编辑</button>
    </div>` : ''}
    <div class="modal-body">
      ${isNew ? `
      <div id="tabUpload">
        <div class="dropzone" id="edDropzone">
          <div class="dz-arrow">↑</div>
          <div class="dz-main">点击上传，或将文件拖拽到此处</div>
          <div class="dz-sub">支持 Excel (xlsx) / CSV / 文本 · 自动识别「型号 / 系列 / 品类 / 价格」等字段</div>
          <input type="file" id="edFileInput" accept=".xlsx,.xls,.csv" hidden>
        </div>
        <div class="upload-foot">识别后可直接逐行编辑：<button class="link-btn" id="skipUpload">也可以跳过上传，直接手动录入 →</button></div>
      </div>` : ''}
      <div id="tabForm" style="${isNew ? 'display:none' : ''}">
      <div class="notice info">带 <span style="color:var(--red)">*</span> 为必填项；枚举字段请从下拉选择，避免同一产品多种写法。</div>
      <div class="form-grid" id="formGrid"></div>
      <div class="section-title">自定义字段 <span class="hint">随「产品系列」联动</span></div>
      <div class="form-grid" id="cfGrid"></div>
      <div class="section-title">产品描述（富文本）</div>
      <div class="rte-toolbar">
        <button data-c="bold" title="加粗"><b>B</b></button><button data-c="italic" title="斜体"><i>I</i></button>
        <button data-c="insertUnorderedList" title="列表">≡</button>
      </div>
      <div class="rte-area" id="edDesc" contenteditable="true"></div>
      <div class="section-title">标签</div>
      <div class="tags-input" id="tagsBox"><input id="tagInput" placeholder="输入标签后回车"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-x="cancel">取消</button>
      ${!isNew ? `<button class="btn" data-x="submitReview" title="提交审核而不直接发布">提交审核</button>` : ''}
      <button class="btn primary" data-x="save" ${isNew ? 'style="display:none"' : ''}>${can('directPublish') ? '保存并发布' : '保存并提交审核'}</button>
    </div>`;
  modal.classList.add('open');

  // 页签切换（仅新建时存在）
  function switchTab(t) {
    $$('.mtab', box).forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    const up = $('#tabUpload', box), fm = $('#tabForm', box);
    if (up) up.style.display = t === 'upload' ? '' : 'none';
    if (fm) fm.style.display = t === 'form' ? '' : 'none';
    const saveBtn = $('[data-x="save"]', box);
    if (saveBtn && isNew) saveBtn.style.display = t === 'form' ? '' : 'none';
  }
  $$('.mtab', box).forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  const skipBtn = $('#skipUpload', box);
  if (skipBtn) skipBtn.onclick = () => switchTab('form');

  // 上传解析：识别表头 → 取第一条有效行 → 预填表单
  const dz = $('#edDropzone', box), fi = $('#edFileInput', box);
  if (dz) {
    dz.onclick = () => fi.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = () => dz.classList.remove('drag');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); parseNewFile(e.dataTransfer.files[0]); };
    fi.onchange = () => parseNewFile(fi.files[0]);
  }
  function parseNewFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast('仅支持 Excel/CSV 文件（演示版）', 'err'); return; }
    if (typeof XLSX === 'undefined') { toast('表格解析库（CDN）加载失败，请检查网络', 'err'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
        // 找表头行
        let headerRow = -1, header = [];
        for (let i = 0; i < Math.min(rows.length, 12); i++) {
          const joined = rows[i].map(c => String(c)).join('|');
          if (/型号|产品名称|SKU/.test(joined)) { headerRow = i; header = rows[i].map(c => String(c).replace(/\s+/g, '')); break; }
        }
        if (headerRow < 0) { headerRow = 0; header = rows[0].map(c => String(c)); }
        const map = {};
        header.forEach((h, idx) => {
          if (!h) return;
          for (const [field, hints] of Object.entries(COL_HINTS)) {
            if (map[field] !== undefined) continue;
            if (hints.some(t => h.toLowerCase().includes(t.toLowerCase()))) map[field] = idx;
          }
        });
        // 取第一条有效数据行
        for (let i = headerRow + 1; i < rows.length; i++) {
          const get = (field) => map[field] !== undefined ? String(rows[i][map[field]] ?? '').trim() : '';
          const model = get('model');
          if (!model || !/[A-Za-z0-9]/.test(model)) continue;
          FIELD_KEYS.forEach(k => { const v = get(k); if (v && v !== '/' && v !== '-') f0[k] = v; });
          if (/^\d{5}$/.test(f0.launchDate || '')) {
            const d = new Date(Date.UTC(1899, 11, 30) + Number(f0.launchDate) * 864e5);
            const p2 = (n) => String(n).padStart(2, '0');
            f0.launchDate = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
          }
          if (f0.priceNormal && !isNaN(String(f0.priceNormal).replace(/[,¥]/g, ''))) f0.priceNormal = Number(String(f0.priceNormal).replace(/[,¥]/g, ''));
          renderForm(); renderCF();
          switchTab('form');
          toast(`已识别「${file.name}」第 ${i + 1} 行数据并带入表单，请核对后保存`, 'ok');
          return;
        }
        toast('未识别到有效数据行（需包含"型号"列且含字母/数字）', 'err');
      } catch (err) { toast('文件解析失败：' + err.message, 'err'); }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderForm() {
  const grid = $('#formGrid', box);
  grid.innerHTML = STRUCT_FIELDS.filter(x => !['owner', 'targetMarket'].includes(x.k)).map(x => {
    const v = f0[x.k] ?? '';
    let input;
    if (x.type === 'enum') {
      input = `<select data-k="${x.k}"><option value="">请选择</option>${x.options.map(o => `<option ${String(v) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    } else if (x.type === 'date') {
      input = `<input type="date" data-k="${x.k}" value="${esc(String(v).replace(/\./g, '-')).slice(0, 10)}">`;
    } else if (x.type === 'number') {
      input = `<input type="number" step="0.01" min="0" data-k="${x.k}" value="${v === undefined ? '' : v}">`;
    } else if (x.multiline) {
      input = `<textarea data-k="${x.k}" rows="3" placeholder="Enter 换行">${esc(v)}</textarea>`;
    } else {
      input = `<input type="text" data-k="${x.k}" value="${esc(v)}">`;
    }
    return `<div class="form-item" data-f="${x.k}"><label>${x.label}${x.required ? ' <span class="req">*</span>' : ''}</label>${input}<div class="err">该项为必填</div></div>`;
  }).join('') + `
    <div class="form-item form-full" data-f="owner"><label>负责人 <span class="req">*</span></label>
      <select data-k="owner"><option value="">请选择</option>${STRUCT_FIELDS.find(x => x.k === 'owner').options.map(o => `<option ${f0.owner === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <div class="err">请指定负责人</div></div>
    <div class="form-item"><label>目标市场</label><input type="text" data-k="targetMarket" value="${esc(f0.targetMarket || '中国大陆')}"></div>`;
  }
  renderForm();

  function renderCF() {
    $('#cfGrid', box).innerHTML = applicableCF().map(cf => {
      const v = c0[cf.id];
      const val = Array.isArray(v) ? v.join(',') : (v ?? '');
      let input;
      if (cf.type === 'enum' && cf.options.length) {
        if (cf.label.includes('多选')) input = `<input type="text" data-cf="${cf.id}" value="${esc(val)}" placeholder="逗号分隔">`;
        else input = `<select data-cf="${cf.id}"><option value="">请选择</option>${cf.options.map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      } else input = `<input type="text" data-cf="${cf.id}" value="${esc(val)}">`;
      return `<div class="form-item"><label>${esc(cf.label)}${cf.required ? ' <span class="req">*</span>' : ''}</label>${input}</div>`;
    }).join('') || '<div style="color:var(--muted);font-size:.85rem">当前系列暂无自定义字段，可在「设置」中配置。</div>';
  }
  renderCF();
  $('#formGrid [data-k="series"]', box)?.addEventListener('change', () => { renderCF(); });

  $('#edDesc', box).innerHTML = d0;
  $$('.rte-toolbar button', box).forEach(b => b.onclick = (e) => { e.preventDefault(); document.execCommand(b.dataset.c, false, null); $('#edDesc', box).focus(); });

  const tagsBox = $('#tagsBox', box), tagInput = $('#tagInput', box);
  function renderTags() {
    $$('.tag', tagsBox).forEach(t => t.remove());
    t0.forEach(t => {
      const s = document.createElement('span'); s.className = 'tag accent';
      s.innerHTML = esc(t) + '<span class="x">✕</span>';
      s.querySelector('.x').onclick = () => { t0.splice(t0.indexOf(t), 1); renderTags(); };
      tagsBox.insertBefore(s, tagInput);
    });
  }
  renderTags();
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && tagInput.value.trim()) { t0.push(tagInput.value.trim()); tagInput.value = ''; renderTags(); e.preventDefault(); }
  });

  $('.modal-head .close', box).onclick = box.querySelector('[data-x="cancel"]').onclick = () => modal.classList.remove('open');

  function collect() {
    const fields = {};
    $$('[data-k]', box).forEach(i => {
      let v = i.value;
      if (i.dataset.k.startsWith('price') || ['priceBulk50'].includes(i.dataset.k)) v = v === '' ? null : Number(v);
      fields[i.dataset.k] = v;
    });
    const custom = {};
    $$('[data-cf]', box).forEach(i => { custom[i.dataset.cf] = i.value; });
    return { fields, custom, description: $('#edDesc', box).innerHTML, tags: t0 };
  }
  function validate(data) {
    let ok = true;
    STRUCT_FIELDS.forEach(x => {
      const item = $(`[data-f="${x.k}"]`, box);
      if (!item) return;
      const bad = x.required && (data.fields[x.k] === undefined || data.fields[x.k] === '');
      if (x.type === 'number' && data.fields[x.k] !== null && data.fields[x.k] !== '' && data.fields[x.k] !== undefined && isNaN(Number(data.fields[x.k]))) { item.classList.add('invalid'); ok = false; return; }
      item.classList.toggle('invalid', !!bad);
      if (bad) ok = false;
    });
    DB.customFields.filter(cf => cf.required).forEach(cf => {
      if ((cf.applies === 'all' || cf.applies === data.fields.series) && !data.custom[cf.id]) { toast(`自定义字段「${cf.label}」为必填`, 'err'); ok = false; }
    });
    return ok;
  }
  function dupWarning(model) {
    const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    const dup = DB.products.find(x => x.id !== (p && p.id) && norm(x.fields.model) === norm(model));
    if (dup) return dup;
    return null;
  }

  function applySave(submitReview) {
    const data = collect();
    if (!validate(data)) return toast('请检查必填项与格式', 'err');
    const dup = dupWarning(data.fields.model);
    if (dup && !confirm(`检测到疑似重复产品：「${dup.fields.model}」（${dup.id}）。\n仍要继续保存吗？（可在"数据质量"页进行合并）`)) return;

    if (isNew) {
      const np = {
        id: 'P' + uid().toUpperCase().slice(-6), fields: data.fields, custom: data.custom,
        description: data.description, tags: data.tags, attachments: [], comments: [], versions: [],
        recordStatus: submitReview ? 'pending' : (can('directPublish') ? 'published' : 'pending'),
        subscribers: [ME.name], createdAt: now().slice(0, 10),
        updatedAt: now(), updatedBy: ME.name,
      };
      np.versions.push({ id: uid(), at: now(), by: ME.name, note: '新建产品', snapshot: JSON.parse(JSON.stringify(data.fields)), changes: [] });
      if (np.recordStatus === 'pending') np.pendingData = JSON.parse(JSON.stringify({ fields: data.fields, custom: data.custom, description: data.description }));
      DB.products.unshift(np);
      notifyReviewers(np, `${ME.name} 提交了新产品 ${data.fields.model} 待审核`);
      saveDB(); modal.classList.remove('open');
      toast(submitReview || !can('directPublish') ? '已提交审核，等待审核者确认' : '产品已创建并发布', 'ok');
      renderNav(); go('products');
    } else {
      const changes = diffFields(p.fields, data.fields);
      const customChanges = diffCustom(p.custom, data.custom);
      const major = changes.length + customChanges.length > 0;
      if (submitReview || (!can('directPublish'))) {
        p.pendingData = { fields: data.fields, custom: data.custom, description: data.description, tags: data.tags };
        p.recordStatus = 'pending';
        notifyReviewers(p, `${ME.name} 提交了 ${p.fields.model} 的修改待审核`);
        toast('修改已提交审核', 'ok');
      } else {
        p.fields = data.fields; p.custom = data.custom;
        p.description = data.description; p.tags = data.tags;
        if (major) p.versions.unshift({ id: uid(), at: now(), by: ME.name, note: '编辑更新', snapshot: JSON.parse(JSON.stringify(data.fields)), changes: [...changes, ...customChanges] });
        notifySubscribers(p, `${ME.name} 更新了 ${p.fields.model}`);
        toast('已保存并发布', 'ok');
      }
      p.updatedAt = now(); p.updatedBy = ME.name;
      saveDB(); modal.classList.remove('open');
      renderNav(); if (currentView === 'products') renderProducts();
      if (drawerPid === p.id) renderDrawer();
    }
  }
  box.querySelector('[data-x="save"]').onclick = () => applySave(false);
  box.querySelector('[data-x="submitReview"]')?.addEventListener('click', () => applySave(true));
}
function notifyReviewers(p, text) {
  DB.users.filter(u => u.role === 'reviewer' || u.role === 'admin').forEach(u => {
    if (u.name !== ME.name) DB.todos.push({ id: uid(), for: u.name, text, pid: p.id, at: now() });
  });
}
function diffFields(oldF, newF) {
  return FIELD_KEYS.filter(k => String(oldF[k] ?? '') !== String(newF[k] ?? '')).map(k => ({
    label: FIELD_MAP[k], from: oldF[k] ?? '', to: newF[k] ?? '',
  }));
}
function diffCustom(oldC, newC) {
  const ids = new Set([...Object.keys(oldC), ...Object.keys(newC)]);
  return [...ids].filter(id => String(oldC[id] ?? '') !== String(newC[id] ?? '')).map(id => {
    const cf = DB.customFields.find(c => c.id === id);
    return { label: '自定义:' + (cf ? cf.label : id), from: oldC[id] ?? '', to: newC[id] ?? '' };
  });
}
function logVersion(p, changes, note) {
  p.versions.unshift({ id: uid(), at: now(), by: ME.name, note, snapshot: JSON.parse(JSON.stringify(p.fields)), changes });
}

/* =========================================================
 * 审核中心
 * ======================================================= */
function renderReview() {
  const el = $('#view-review');
  const pend = DB.products.filter(p => p.recordStatus === 'pending');
  const rejected = DB.products.filter(p => p.recordStatus === 'rejected');
  el.innerHTML = `
    <div class="page-head"><div><h1>审核中心</h1><div class="sub">新建与重大修改需审核通过后生效，防止错误信息污染搜索与决策</div></div></div>
    ${!can('review') ? '<div class="notice warn">当前角色（' + ROLES[ME.role] + '）只有查看权限，审核操作需管理员或审核者。</div>' : ''}
    ${pend.length ? pend.map(p => reviewCard(p)).join('') : '<div class="card empty-state">没有待审核的产品</div>'}
    ${rejected.length ? `<div class="section-title">已驳回（${rejected.length}）</div>` + rejected.map(p => `
      <div class="card review-card"><div class="r-head"><b>${esc(p.fields.model)}</b>${statusBadge(p.fields.status)}
        <span class="tag" style="background:var(--red-weak);color:var(--red)">已驳回：${esc(p.reviewNote || '')}</span>
        <span class="r-ops">${can('editAll') || p.fields.owner === ME.name ? `<button class="btn sm" data-reedit="${p.id}">重新编辑</button>` : ''}</span></div></div>`).join('') : ''}`;

  $$('[data-review]', el).forEach(b => b.onclick = () => {
    const [pid, act] = b.dataset.review.split(':');
    const p = DB.products.find(x => x.id === pid);
    if (!p) return;
    if (act === 'approve') {
      if (p.pendingData) {
        const changes = [...diffFields(p.fields, p.pendingData.fields), ...diffCustom(p.custom, p.pendingData.custom)];
        if (p.versions.length) { p.fields = p.pendingData.fields; p.custom = p.pendingData.custom; p.description = p.pendingData.description; if (p.pendingData.tags) p.tags = p.pendingData.tags; }
        p.versions.unshift({ id: uid(), at: now(), by: ME.name + '（审核通过）', note: '审核通过，变更生效', snapshot: JSON.parse(JSON.stringify(p.fields)), changes });
        p.pendingData = null;
      } else { p.recordStatus = 'published'; }
      p.recordStatus = 'published';
      p.updatedAt = now(); p.updatedBy = ME.name;
      notifySubscribers(p, `${p.fields.model} 的变更已审核通过`);
      toast('已通过并发布', 'ok');
    } else {
      const note = prompt('驳回原因（将展示给提交人）：', '价格数据与价格表不一致，请复核');
      if (note === null) return;
      p.recordStatus = 'rejected'; p.reviewNote = note;
      if (p.fields.owner) DB.todos.push({ id: uid(), for: p.fields.owner, text: `❌ ${p.fields.model} 的提交被驳回：${note}`, pid: p.id, at: now() });
      toast('已驳回', 'ok');
    }
    saveDB(); renderReview(); renderNav();
  });
  $$('[data-viewp]', el).forEach(b => b.onclick = () => openDrawer(b.dataset.viewp));
  $$('[data-reedit]', el).forEach(b => b.onclick = () => openEditor(DB.products.find(x => x.id === b.dataset.reedit)));
}
function reviewCard(p) {
  let diffHtml = '';
  if (p.pendingData) {
    const changes = [...diffFields(p.fields, p.pendingData.fields), ...diffCustom(p.custom, p.pendingData.custom)];
    diffHtml = changes.length ? changes.map(c =>
      `<div class="diff-row"><span class="df">${esc(c.label)}</span><span class="old">${esc(c.from === '' ? '（空）' : c.from)}</span><span class="new">${esc(c.to === '' ? '（空）' : c.to)}</span></div>`).join('')
      : '<div style="color:var(--muted);font-size:.85rem">新建产品，无对比基线</div>';
  }
  return `<div class="card review-card">
    <div class="r-head"><b>${esc(p.fields.model)}</b><span class="tag accent">${esc(p.fields.series || '')}</span>
      ${statusBadge(p.fields.status)}<span style="color:var(--muted);font-size:.8rem">提交人：${esc(p.updatedBy)} · ${esc(p.updatedAt)}</span>
      <span class="r-ops">
        <button class="btn sm" data-viewp="${p.id}">查看详情</button>
        ${can('review') ? `<button class="btn sm success" data-review="${p.id}:approve">通过</button>
        <button class="btn sm danger" data-review="${p.id}:reject">驳回</button>` : ''}
      </span></div>
    ${diffHtml ? `<div class="ver-diff">${diffHtml}</div>` : ''}
  </div>`;
}

/* =========================================================
 * 导入识别（Excel解析 → 待确认 → 人工校对入库）
 * ======================================================= */
const COL_HINTS = {
  model: ['型号', '产品名称', 'sku', '产品型号'],
  series: ['系列', '产品系列', '系列名'],
  channel: ['渠道', '销售渠道', '渠道品类'],
  brand: ['品牌'],
  launchDate: ['上市时间', '上市日期'],
  priceNormal: ['日常价', '指导价', '电商指导价', '官方价'],
  pricePromo: ['大促价', '直降指导价', '活动价', '促销价'],
  priceS: ['s秒杀价', '秒杀价'],
  priceOnlineDist: ['线上分销价', '分销价', '线上旗舰店价'],
  priceDealer: ['经销商供货价', '供货价', '工程价'],
  priceSubsidy: ['国补', '国补到手价', '补贴'],
  status: ['产品状态', '状态'],
  owner: ['负责人', '产品负责人'],
  targetMarket: ['目标市场', '市场'],
};
let importSession = null;

function renderImport() {
  const el = $('#view-import');
  const pend = DB.recQueue.filter(r => r.status === 'pending');
  const done = DB.recLog;
  el.innerHTML = `
    <div class="page-head"><div><h1>导入识别</h1><div class="sub">上传 Excel/CSV → 自动抽取字段 → 人工校对确认后入库（识别不直接生效）</div></div></div>
    <div class="card" style="padding:18px;margin-bottom:16px">
      <div class="dropzone" id="dropzone">
        <div class="big">—</div>
        <p><b>点击选择或拖拽文件到此处</b></p>
        <p style="font-size:.82rem">支持 .xlsx / .xls / .csv（Excel 与 PDF/图片识别需配合 OCR 服务，前端演示版支持表格文件直读）</p>
      </div>
      <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" hidden>
      <div id="mapArea"></div>
    </div>
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div class="section-title" style="margin-top:0">待确认识别结果（${pend.length}）<span class="hint">校对后点击"确认入库"才写入产品库</span></div>
      <div class="rec-table">${pend.map(r => `
        <div class="rec-item"><span class="f-ico st"></span>
          <div><div><b>${esc(r.data.model || '（未识别到型号）')}</b> <span class="tag">${esc(r.data.series || '系列?')}</span> ${fmtMoney(r.data.priceNormal)}</div>
          <div class="rec-fields">来源：${esc(r.file)} 第${r.row}行 · 缺失字段：${r.missing.length ? esc(r.missing.map(m => FIELD_MAP[m] || m).join('、')) : '无'}</div></div>
          <div class="ops">
            <button class="btn sm" data-correct="${r.id}">校对</button>
            <button class="btn sm success" data-confirm="${r.id}" ${r.ok ? '' : 'disabled'}>入库</button>
            <button class="btn sm danger" data-drop="${r.id}">丢弃</button>
          </div></div>`).join('') || '<div class="empty-tip">队列为空，先上传文件</div>'}</div>
    </div>
    <div class="card" style="padding:16px">
      <div class="section-title" style="margin-top:0">识别记录（保留原始文件与识别结果对照）</div>
      <div class="q-list">${done.slice(-12).reverse().map(r => `
        <div class="q-row" style="cursor:default"><span>${r.action === 'confirm' ? '确认入库' : r.action === 'drop' ? '丢弃' : '导入'}</span>
          <span>${esc(r.file)} · 第${r.row}行 · ${esc(r.model)}</span>
          <span class="cnt">${esc(r.at)} · ${esc(r.actionText)}</span></div>`).join('') || '<div class="empty-tip">暂无记录</div>'}</div>
    </div>`;

  const dz = $('#dropzone', el), fi = $('#fileInput', el);
  dz.onclick = () => fi.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); handleFiles(e.dataTransfer.files); };
  fi.onchange = () => handleFiles(fi.files);

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast('仅支持 Excel/CSV 文件（演示版）', 'err'); return; }
    if (typeof XLSX === 'undefined') { toast('表格解析库（CDN）加载失败，请检查网络', 'err'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        buildMapping(file.name, rows);
      } catch (err) { toast('文件解析失败：' + err.message, 'err'); }
    };
    reader.readAsArrayBuffer(file);
  }

  function buildMapping(fileName, rows) {
    // 找表头行：包含"型号"或"产品名称"的行
    let headerRow = -1, header = [];
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const joined = rows[i].map(c => String(c)).join('|');
      if (/型号|产品名称|SKU/.test(joined)) { headerRow = i; header = rows[i].map(c => String(c).replace(/\s+/g, '')); break; }
    }
    if (headerRow < 0) { headerRow = 0; header = rows[0].map(c => String(c)); }
    const map = {};
    header.forEach((h, idx) => {
      if (!h) return;
      for (const [field, hints] of Object.entries(COL_HINTS)) {
        if (map[field] !== undefined) continue;
        if (hints.some(t => h.toLowerCase().includes(t.toLowerCase()))) map[field] = idx;
      }
    });
    importSession = { fileName, rows, header, headerRow, map };
    renderMapping();
    toast(`已解析 ${fileName}，共 ${rows.length} 行，请检查字段映射`, 'ok');
  }

  function renderMapping() {
    const { fileName, header, map } = importSession;
    $('#mapArea', el).innerHTML = `
      <div class="section-title">字段映射（文件：<b>${esc(fileName)}</b>）<span class="hint">自动识别，可手动修正</span></div>
      <div class="mapping-grid">${Object.keys(COL_HINTS).map(field => `
        <div class="m-item"><span title="${FIELD_MAP[field]}">${FIELD_MAP[field]}</span>
          <select data-map="${field}"><option value="">（不导入）</option>
          ${header.map((h, i) => h ? `<option value="${i}" ${map[field] === i ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
          </select></div>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn primary" id="btnExtract">▶ 开始抽取并进入待确认</button>
        <span style="color:var(--muted);font-size:.82rem;align-self:center">识别结果均为"待确认"状态，需人工校对后入库</span>
      </div>`;
    $$('[data-map]', $('#mapArea', el)).forEach(s => s.onchange = () => { importSession.map[s.dataset.map] = s.value === '' ? undefined : Number(s.value); });
    $('#btnExtract', el).onclick = extractRows;
  }

  function extractRows() {
    const { fileName, rows, headerRow, map } = importSession;
    let count = 0;
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const get = (field) => map[field] !== undefined && map[field] !== null ? String(row[map[field]] ?? '').trim() : '';
      const model = get('model');
      if (!model || !/[A-Za-z0-9]/.test(model)) continue;
      const data = {};
      FIELD_KEYS.forEach(k => { const v = get(k); if (v && v !== '/' && v !== '-') data[k] = v; });
      // Excel 序列号日期（如 45017）转换为 YYYY-MM-DD
      if (/^\d{5}$/.test(data.launchDate || '')) {
        const d = new Date(Date.UTC(1899, 11, 30) + Number(data.launchDate) * 864e5);
        const p2 = (n) => String(n).padStart(2, '0');
        data.launchDate = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
      }
      if (data.priceNormal && !isNaN(data.priceNormal.replace(/[,¥]/g, ''))) data.priceNormal = Number(data.priceNormal.replace(/[,¥]/g, ''));
      const missing = STRUCT_FIELDS.filter(x => x.required && !data[x.k]).map(x => x.k);
      DB.recQueue.push({ id: uid(), file: fileName, row: i + 1, data, ok: missing.length === 0, missing, status: 'pending', at: now() });
      DB.recLog.push({ id: uid(), file: fileName, row: i + 1, model, at: now(), action: 'extract', actionText: '识别抽取，进入待确认' });
      count++;
    }
    saveDB();
    if (!count) toast('未识别到有效数据行（需包含"型号"列且含字母/数字）', 'err');
    else toast(`识别完成：${count} 行进入待确认队列`, 'ok');
    renderImport(); renderNav();
  }

  $$('[data-correct]', el).forEach(b => b.onclick = () => {
    const r = DB.recQueue.find(x => x.id === b.dataset.correct);
    if (!r) return;
    openEditorFromRec(r);
  });
  $$('[data-confirm]', el).forEach(b => b.onclick = () => {
    const r = DB.recQueue.find(x => x.id === b.dataset.confirm);
    if (!r) return;
    const np = {
      id: 'P' + uid().toUpperCase().slice(-6),
      fields: {}, custom: {}, description: `<p>由文件「${esc(r.file)}」第${r.row}行识别导入，已经人工校对确认。</p>`,
      tags: ['导入'], attachments: [{ id: uid(), name: r.file, cat: '报价单', size: 0, type: '', date: now().slice(0, 10), note: `识别来源 第${r.row}行` }],
      comments: [], versions: [], recordStatus: can('directPublish') ? 'published' : 'pending',
      subscribers: [ME.name], createdAt: now().slice(0, 10), updatedAt: now(), updatedBy: ME.name,
    };
    FIELD_KEYS.forEach(k => { if (r.data[k] !== undefined) np.fields[k] = r.data[k]; });
    np.versions.push({ id: uid(), at: now(), by: ME.name, note: `文件识别入库（${r.file} 第${r.row}行）`, snapshot: JSON.parse(JSON.stringify(np.fields)), changes: [] });
    DB.products.unshift(np);
    DB.recQueue = DB.recQueue.filter(x => x !== r);
    DB.recLog.push({ id: uid(), file: r.file, row: r.row, model: r.data.model, at: now(), action: 'confirm', actionText: '人工校对后入库' });
    saveDB(); toast(`「${r.data.model}」已入库`, 'ok');
    renderImport(); renderNav();
  });
  $$('[data-drop]', el).forEach(b => b.onclick = () => {
    const r = DB.recQueue.find(x => x.id === b.dataset.drop);
    DB.recQueue = DB.recQueue.filter(x => x !== r);
    DB.recLog.push({ id: uid(), file: r.file, row: r.row, model: r.data.model, at: now(), action: 'drop', actionText: '人工丢弃' });
    saveDB(); renderImport(); renderNav();
  });
}
function openEditorFromRec(r) {
  openEditor(null);
  setTimeout(() => {
    const box = $('#modalBox');
    FIELD_KEYS.forEach(k => { if (r.data[k] !== undefined) { const inp = box.querySelector(`[data-k="${k}"]`); if (inp) inp.value = r.data[k]; } });
    toast('已载入识别结果，请校对各字段后保存', 'ok');
  }, 50);
  // 标记完成后从队列移除（保存时触发）
  const origSave = box.querySelector('[data-x="save"]');
  origSave.addEventListener('click', () => {
    DB.recQueue = DB.recQueue.filter(x => x !== r);
    DB.recLog.push({ id: uid(), file: r.file, row: r.row, model: r.data.model, at: now(), action: 'confirm', actionText: '人工校对后入库' });
    saveDB();
  }, { once: true });
}

/* =========================================================
 * 数据质量 & 重复合并
 * ======================================================= */
function qualityIssues() {
  const issues = { missing: [], stale: [], noOwner: [], dup: [] };
  const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
  const seen = {};
  const staleDays = 60;
  DB.products.forEach(p => {
    const miss = STRUCT_FIELDS.filter(f => f.required && !p.fields[f.k]).map(f => f.label);
    if (miss.length) issues.missing.push({ p, miss });
    if (!p.fields.owner) issues.noOwner.push(p);
    const gap = (Date.now() - new Date(p.updatedAt.replace(/-/g, '/')).getTime()) / 864e5;
    if (gap > staleDays) issues.stale.push({ p, days: Math.round(gap) });
    const n = norm(p.fields.model);
    if (seen[n]) issues.dup.push([seen[n], p]); else seen[n] = p;
  });
  return issues;
}
function renderQuality() {
  const el = $('#view-quality');
  const q = qualityIssues();
  const score = Math.max(0, 100 - q.missing.length * 2 - q.noOwner.length * 2 - q.stale.length - q.dup.length * 3);
  el.innerHTML = `
    <div class="page-head"><div><h1>数据质量</h1><div class="sub">缺字段、长期未更新、无负责人、重复产品 — 持续治理</div></div></div>
    <div class="stat-grid">
      <div class="card stat-card"><div class="label">质量总分</div><div class="value" style="color:${score >= 85 ? 'var(--green)' : 'var(--orange)'}">${score}</div><div class="delta">按问题数扣分</div></div>
      <div class="card stat-card"><div class="label">必填缺失</div><div class="value" style="color:var(--red)">${q.missing.length}</div><div class="delta">个产品待补全</div></div>
      <div class="card stat-card"><div class="label">长期未更新</div><div class="value" style="color:var(--orange)">${q.stale.length}</div><div class="delta">超过60天</div></div>
      <div class="card stat-card"><div class="label">无负责人</div><div class="value" style="color:var(--orange)">${q.noOwner.length}</div><div class="delta">需指派</div></div>
      <div class="card stat-card"><div class="label">疑似重复</div><div class="value" style="color:var(--purple)">${q.dup.length}</div><div class="delta">对，可合并</div></div>
    </div>
    <div class="q-grid">
      <div class="card chart-card"><h3>必填字段缺失（点击跳转补全）</h3><div class="q-list">
        ${q.missing.slice(0, 10).map(({ p, miss }) => `<div class="q-row" data-q="${p.id}"><b>${esc(p.fields.model)}</b><span style="color:var(--muted)">缺：${esc(miss.join('、'))}</span><span class="cnt">去补全 →</span></div>`).join('') || '<div class="empty-tip">全部完整</div>'}</div></div>
      <div class="card chart-card"><h3>长期未更新 & 无负责人</h3><div class="q-list">
        ${q.stale.slice(0, 6).map(({ p, days }) => `<div class="q-row" data-q="${p.id}"><b>${esc(p.fields.model)}</b><span style="color:var(--muted)">${days} 天未更新</span></div>`).join('')}
        ${q.noOwner.slice(0, 6).map(p => `<div class="q-row" data-q="${p.id}"><b>${esc(p.fields.model)}</b><span style="color:var(--muted)">无负责人</span></div>`).join('') || ''}
        ${(q.stale.length + q.noOwner.length) ? '' : '<div class="empty-tip">无此类问题</div>'}</div></div>
    </div>
    <div class="card chart-card" style="margin-top:12px"><h3>重复产品检测与合并</h3>
      ${q.dup.length ? q.dup.map(([a, b]) => `
        <div class="dup-pair"><b>${esc(a.fields.model)}</b>（${a.id}）与 <b>${esc(b.fields.model)}</b>（${b.id}）
          <span style="color:var(--muted);font-size:.8rem">同型号归一化后重复</span>
          <span class="ops"><button class="btn sm" data-merge="${a.id}|${b.id}">合并（保留前者）</button></span></div>`).join('')
      : '<div class="empty-tip">未检测到重复产品</div>'}
    </div>`;
  $$('[data-q]', el).forEach(r => r.onclick = () => openDrawer(r.dataset.q, 'info'));
  $$('[data-merge]', el).forEach(b => b.onclick = () => {
    const [aid, bid] = b.dataset.merge.split('|');
    mergeProducts(aid, bid);
  });
}
function mergeProducts(keepId, dropId) {
  if (!can('delete')) return toast('合并操作需要管理员权限', 'err');
  const a = DB.products.find(p => p.id === keepId), b = DB.products.find(p => p.id === dropId);
  if (!a || !b) return;
  if (!confirm(`将「${b.fields.model}」(${b.id}) 合并进「${a.fields.model}」(${a.id})？\n规则：空字段用后者补全，评论/附件合并，后者进入回收站。`)) return;
  FIELD_KEYS.forEach(k => { if ((a.fields[k] === undefined || a.fields[k] === '' || a.fields[k] === null) && b.fields[k] !== undefined) a.fields[k] = b.fields[k]; });
  Object.entries(b.custom).forEach(([k, v]) => { if (!a.custom[k]) a.custom[k] = v; });
  a.tags = [...new Set([...a.tags, ...b.tags])];
  a.comments = [...a.comments, ...b.comments];
  a.attachments = [...a.attachments, ...b.attachments];
  a.subscribers = [...new Set([...a.subscribers, ...b.subscribers])];
  logVersion(a, [], `合并产品 ${b.id}（${b.fields.model}）`);
  toBin(b, `合并入 ${a.id}`);
  saveDB(); toast('合并完成', 'ok'); renderQuality(); renderNav();
}

/* =========================================================
 * 回收站
 * ======================================================= */
function toBin(p, note = '手动删除') {
  DB.products = DB.products.filter(x => x !== p);
  DB.bin.unshift({ ...p, binAt: now(), binNote: note, binBy: ME.name });
  saveDB(); toast(`「${p.fields.model}」已移入回收站`, 'ok'); renderNav();
  if (currentView === 'products') renderProducts();
}
function renderBin() {
  const el = $('#view-bin');
  el.innerHTML = `
    <div class="page-head"><div><h1>回收站</h1><div class="sub">防止误删，可随时恢复</div></div>
      <div class="actions">${DB.bin.length && can('delete') ? '<button class="btn danger" id="emptyBin">清空回收站</button>' : ''}</div></div>
    <div class="table-wrap"><table class="list"><thead><tr><th>型号</th><th>系列</th><th>删除时间</th><th>删除人</th><th>原因</th><th>操作</th></tr></thead><tbody>
      ${DB.bin.map(p => `<tr><td><b>${esc(p.fields.model)}</b></td><td>${esc(p.fields.series || '')}</td>
        <td>${esc(p.binAt)}</td><td>${esc(p.binBy)}</td><td>${esc(p.binNote)}</td>
        <td><button class="btn sm success" data-restore="${p.id}">恢复</button></td></tr>`).join('')}
    </tbody></table></div>
    ${!DB.bin.length ? '<div class="empty-state">回收站是空的</div>' : ''}`;
  $$('[data-restore]', el).forEach(b => b.onclick = () => {
    const p = DB.bin.find(x => x.id === b.dataset.restore);
    DB.bin = DB.bin.filter(x => x !== p);
    p.recordStatus = 'draft';
    DB.products.unshift(p);
    saveDB(); toast(`「${p.fields.model}」已恢复为草稿`, 'ok'); renderBin(); renderNav();
  });
  $('#emptyBin', el)?.addEventListener('click', () => {
    if (confirm('确认永久清空回收站？此操作不可恢复。')) { DB.bin = []; saveDB(); renderBin(); toast('回收站已清空'); }
  });
}

/* =========================================================
 * 设置：自定义字段 / 角色说明
 * ======================================================= */
function renderSettings() {
  const el = $('#view-settings');
  el.innerHTML = `
    <div class="page-head"><div><h1>数据字典</h1><div class="sub">自定义字段配置与权限矩阵</div></div></div>
    <div class="settings-grid">
      <div class="card" style="padding:18px">
        <div class="section-title" style="margin-top:0">自定义字段</div>
        <table class="cf-table"><thead><tr><th>名称</th><th>类型</th><th>适用</th><th>必填</th><th></th></tr></thead><tbody>
          ${DB.customFields.map(cf => `<tr><td>${esc(cf.label)}</td><td>${esc(cf.type)}</td>
            <td>${cf.applies === 'all' ? '全系列' : esc(cf.applies)}</td><td>${cf.required ? '✔' : '—'}</td>
            <td><button class="btn sm danger" data-cfdel="${cf.id}">删除</button></td></tr>`).join('')}
        </tbody></table>
        <div class="form-grid" style="margin-top:12px">
          <div class="form-item"><label>字段名称</label><input id="cfLabel" placeholder="如：防水等级"></div>
          <div class="form-item"><label>类型</label><select id="cfType"><option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="enum">枚举（下拉）</option></select></div>
          <div class="form-item"><label>枚举值（逗号分隔，枚举类型时填写）</label><input id="cfOpts" placeholder="IPX4,IPX5,IPX6"></div>
          <div class="form-item"><label>适用产品线</label><select id="cfApply"><option value="all">全系列</option>${STRUCT_FIELDS.find(x => x.k === 'series').options.map(s => `<option>${s}</option>`).join('')}</select></div>
          <div class="form-item"><label>必填</label><select id="cfReq"><option value="no">否</option><option value="yes">是</option></select></div>
          <div class="form-item" style="display:flex;align-items:flex-end"><button class="btn primary" id="cfAdd" style="width:100%">＋ 添加字段</button></div>
        </div>
      </div>
      <div class="card" style="padding:18px">
        <div class="section-title" style="margin-top:0">角色权限矩阵 <span class="hint">顶栏可切换角色体验</span></div>
        <table class="role-table"><thead><tr><th>角色</th><th>权限</th></tr></thead><tbody>
          <tr><td><b>查看者</b></td><td><div class="matrix"><span>查看</span><span class="no">编辑</span><span class="no">审核</span></div></td></tr>
          <tr><td><b>填写者</b></td><td><div class="matrix"><span>查看</span><span>新建/编辑自己的</span><span>提交审核</span><span>评论</span><span class="no">直接发布</span></div></td></tr>
          <tr><td><b>编辑者</b></td><td><div class="matrix"><span>查看</span><span>编辑全部</span><span>直接发布</span><span>评论</span><span class="no">审核</span><span class="no">删除</span></div></td></tr>
          <tr><td><b>审核者</b></td><td><div class="matrix"><span>编辑者权限</span><span>审核通过/驳回</span></div></td></tr>
          <tr><td><b>管理员</b></td><td><div class="matrix"><span>全部权限</span><span>删除/回收站</span><span>合并</span><span>自定义字段</span></div></td></tr>
        </tbody></table>
        <div class="notice info" style="margin-top:12px">外部共享：演示版未启用；生产版建议共享链接带有效期与访问控制。</div>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="resetBtn">重置演示数据</button>
          <button class="btn" id="clearStorageBtn">清除本地存储</button>
        </div>
      </div>
    </div>`;
  $('#cfAdd', el).onclick = () => {
    const label = $('#cfLabel', el).value.trim();
    if (!label) return toast('请输入字段名称', 'err');
    const type = $('#cfType', el).value;
    const opts = $('#cfOpts', el).value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (type === 'enum' && !opts.length) return toast('枚举类型需填写枚举值', 'err');
    DB.customFields.push({ id: uid(), label, type, options: opts, required: $('#cfReq', el).value === 'yes', applies: $('#cfApply', el).value });
    saveDB(); toast('自定义字段已添加', 'ok'); renderSettings();
  };
  $$('[data-cfdel]', el).forEach(b => b.onclick = () => {
    DB.customFields = DB.customFields.filter(cf => cf.id !== b.dataset.cfdel);
    saveDB(); renderSettings();
  });
  $('#resetBtn', el).onclick = () => { if (confirm('重置为初始演示数据？')) { DB = seedDB(); saveDB(); toast('已重置', 'ok'); go('dashboard'); } };
  $('#clearStorageBtn', el).onclick = () => { localStorage.removeItem(LS_KEY); toast('已清除，刷新页面重新初始化'); };
}

/* =========================================================
 * 导出 Excel
 * ======================================================= */
function exportExcel(list, title) {
  if (typeof XLSX === 'undefined') return toast('导出组件未加载（CDN）', 'err');
  const rows = list.map(p => {
    const row = { '产品ID': p.id };
    FIELD_KEYS.forEach(k => row[FIELD_MAP[k]] = p.fields[k] ?? '');
    DB.customFields.forEach(cf => row['[自定义]' + cf.label] = Array.isArray(p.custom[cf.id]) ? p.custom[cf.id].join(',') : (p.custom[cf.id] ?? ''));
    row['标签'] = p.tags.join(' ');
    row['描述(纯文本)'] = stripHtml(p.description).trim().slice(0, 300);
    row['记录状态'] = p.recordStatus;
    row['负责人'] = p.fields.owner || '';
    row['更新时间'] = p.updatedAt;
    row['更新人'] = p.updatedBy;
    row['附件数'] = p.attachments.length;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '产品数据');
  XLSX.writeFile(wb, `${title}_${now().slice(0, 10)}.xlsx`);
  toast(`已导出 ${rows.length} 条`, 'ok');
}

/* =========================================================
 * 待办 & 顶栏
 * ======================================================= */
function renderBell() {
  const mine = DB.todos.filter(t => t.for === ME.name);
  const dot = $('#bellDot');
  dot.style.display = mine.length ? 'flex' : 'none';
  dot.textContent = mine.length;
  $('#todoList').innerHTML = mine.slice(-8).reverse().map(t =>
    `<div class="todo-item" data-todo="${t.id}">${esc(t.text)}<div class="todo-meta">${esc(t.at)}</div></div>`).join('')
    || '<div class="empty-tip">暂无待办</div>';
  $$('#todoList .todo-item').forEach(i => i.onclick = () => {
    const t = DB.todos.find(x => x.id === i.dataset.todo);
    DB.todos = DB.todos.filter(x => x !== t);
    saveDB(); renderBell();
    $('#bellPop').classList.remove('open');
    if (t.pid && DB.products.find(p => p.id === t.pid)) openDrawer(t.pid);
  });
}
function renderUser() {
  const av = $('#ucAvatar');
  if (!av) return;
  av.textContent = ME.name[0];
  av.style.background = avatarColor(ME.name);
  $('#ucName').textContent = `${ME.name}（${ROLES[ME.role]}）`;
  $('#ucDesc').textContent = ROLE_DESC[ME.role];
  $('#userSelect').innerHTML = DB.users.map(u => `<option value="${u.name}" ${u.name === ME.name ? 'selected' : ''}>切换：${u.name} · ${ROLES[u.role]}</option>`).join('');
}

/* =========================================================
 * 初始化
 * ======================================================= */
function bindTopbar() {
  const input = $('#globalSearch');
  input.addEventListener('input', debounce(renderSuggest, 200));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doGlobalSearch(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') { $('#suggestPop').classList.remove('open'); $('#bellPop').classList.remove('open'); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.global-search')) $('#suggestPop').classList.remove('open');
    if (!e.target.closest('.bell-wrap')) $('#bellPop').classList.remove('open');
  });
  $('#bellBtn').onclick = (e) => { e.stopPropagation(); renderBell(); $('#bellPop').classList.toggle('open'); };
  $('#clearTodos').onclick = () => { DB.todos = DB.todos.filter(t => t.for !== ME.name); saveDB(); renderBell(); };
  $('#drawerMask').onclick = closeDrawer;
}

function init() {
  loadDB();
  bindTopbar();
  renderUser();
  renderNav();
  go('dashboard');
  renderBell();
  /* 方案A：云端同步——本地先渲染保证秒开，随后后台拉取云端共享数据，有更新则覆盖重渲染 */
  if (typeof cloudSync === 'function') cloudSync(() => { renderNav(); go(currentView || 'dashboard'); renderBell(); });
  if (typeof XLSX === 'undefined') console.warn('SheetJS 未加载：导入/导出功能不可用');
}

/* ===== 登录门（纯前端访问控制：账号 admin123 / 密码 cp123456） ===== */
const GATE_USER = 'admin123';
const GATE_PASS = 'cp123456';
const AUTH_KEY = 'pim_auth';

function showGate() {
  const mask = document.createElement('div');
  mask.id = 'loginGate';
  mask.innerHTML = `
  <style>
    #loginGate{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#eef1fb,#e6ebff);}
    #loginGate .card{width:360px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(30,40,120,.12);padding:40px 36px;text-align:left;}
    #loginGate h1{font-size:20px;color:#1c2340;margin:0 0 6px;}
    #loginGate .sub{font-size:12px;color:#8a90a8;margin:0 0 24px;}
    #loginGate input{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;border:1px solid #d8dcec;border-radius:8px;font-size:14px;outline:none;}
    #loginGate input:focus{border-color:#4b5ae8;}
    #loginGate button{width:100%;padding:11px 0;border:0;border-radius:8px;background:#4b5ae8;color:#fff;font-size:14px;cursor:pointer;margin-top:4px;}
    #loginGate button:hover{background:#3f4dd0;}
    #loginGate .err{color:#e05a5a;font-size:12px;min-height:18px;margin:6px 0 0;}
  </style>
  <div class="card">
    <h1>锁云 · 产品主数据平台</h1>
    <div class="sub">请使用公司分配的账号登录访问</div>
    <input id="gateUser" placeholder="登录账号" autocomplete="username">
    <input id="gatePass" type="password" placeholder="密码" autocomplete="current-password">
    <button id="gateBtn">登 录</button>
    <div class="err" id="gateErr"></div>
  </div>`;
  document.body.appendChild(mask);
  const tryLogin = () => {
    const u = mask.querySelector('#gateUser').value.trim();
    const p = mask.querySelector('#gatePass').value;
    if (u === GATE_USER && p === GATE_PASS) {
      try { localStorage.setItem(AUTH_KEY, 'yes'); } catch (e) { /* ignore */ }
      mask.remove();
      init();
    } else {
      mask.querySelector('#gateErr').textContent = '账号或密码不正确，请重试';
    }
  };
  mask.querySelector('#gateBtn').onclick = tryLogin;
  mask.querySelector('#gatePass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  mask.querySelector('#gateUser').addEventListener('keydown', e => { if (e.key === 'Enter') mask.querySelector('#gatePass').focus(); });
}

(function boot() {
  let authed = false;
  try { authed = localStorage.getItem(AUTH_KEY) === 'yes'; } catch (e) { /* ignore */ }
  if (authed) { init(); } else { showGate(); }
})();
