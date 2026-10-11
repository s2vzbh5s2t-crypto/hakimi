/* Hakimi 管理面板（零构建 SPA） */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------- 基础 ---------- */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 401 && !path.includes('/login')) { showAuth(false); throw new Error('请先登录'); }
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data?.data ?? data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 1800);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast('已复制'));
}

/* ---------- 鉴权视图 ---------- */

function showAuth(configured) {
  $('#main-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  $('#setup-form').classList.toggle('hidden', configured);
  $('#login-form').classList.toggle('hidden', !configured);
}

function showMain() {
  $('#auth-view').classList.add('hidden');
  $('#main-view').classList.remove('hidden');
  loadServers(); loadUsers(); loadSubs(); loadSettings();
}

async function init() {
  try {
    const me = await api('/api/admin/me');
    if (me.configured) showAuth(true); else showAuth(false);
  } catch {
    showAuth(true);
  }
}

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = $('#setup-password').value, p2 = $('#setup-password2').value;
  if (p1 !== p2) return ($('#auth-error').textContent = '两次密码不一致');
  try {
    await api('/api/admin/setup', { method: 'POST', body: { password: p1 } });
    await api('/api/admin/login', { method: 'POST', body: { password: p1 } });
    showMain();
  } catch (err) { $('#auth-error').textContent = err.message; }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: $('#login-password').value } });
    showMain();
  } catch (err) { $('#auth-error').textContent = err.message; }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showAuth(true);
});

/* ---------- Tab ---------- */

$$('.tab').forEach((btn) => btn.addEventListener('click', () => {
  $$('.tab').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  $$('main > section').forEach((s) => s.classList.add('hidden'));
  $(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
}));

/* ---------- 弹窗 ---------- */

let modalSaveFn = null;

function openModal(title, contentHtml, onSave) {
  $('#modal-title').textContent = title;
  $('#modal-content').innerHTML = contentHtml;
  $('#modal').classList.remove('hidden');
  modalSaveFn = onSave;
}
function closeModal() { $('#modal').classList.add('hidden'); modalSaveFn = null; }
$('#modal-cancel').addEventListener('click', closeModal);
$('#modal-save').addEventListener('click', async () => {
  if (modalSaveFn) {
    try { await modalSaveFn(); closeModal(); } catch (err) { toast(err.message); }
  }
});

/* ---------- 节点 ---------- */

const TYPE_PRESETS = {
  vless: {
    network: 'ws',
    network_settings: { path: '/ws', host: 'example.com' },
    tls: 1,
    tls_settings: { server_name: 'example.com' },
    flow: '',
    // Reality 示例：tls 填 2，reality_settings: { server_names:['example.com'], dest:'example.com:443', private_key:'', public_key:'', short_id:'' }
  },
  vmess: {
    network: 'ws',
    network_settings: { path: '/ws', host: 'example.com' },
    tls: 1,
    tls_settings: { server_name: 'example.com' },
  },
  trojan: {
    network: 'tcp',
    tls: 1,
    tls_settings: { server_name: 'example.com' },
  },
  shadowsocks: {
    cipher: 'aes-128-gcm',
    // 2022 系列：'2022-blake3-aes-128-gcm' / '2022-blake3-aes-256-gcm'
    plugin: null,
    plugin_opts: null,
  },
  hysteria: {
    version: 2,
    tls: { server_name: 'example.com' },
    bandwidth: { up: 100, down: 100 },
    obfs: { open: false, type: 'salamander', password: '' },
  },
  tuic: {
    version: 5,
    tls: { server_name: 'example.com' },
    congestion_control: 'bbr',
  },
};

let serverCache = [];

async function loadServers() {
  serverCache = await api('/api/admin/servers');
  const rows = serverCache.map((s) => `
    <tr>
      <td>${s.id}</td>
      <td>${esc(s.code ?? '')}</td>
      <td>${esc(s.name)}</td>
      <td>${esc(s.type)}</td>
      <td>${esc(s.host)}</td>
      <td>${esc(s.port)}</td>
      <td>${s.server_port}</td>
      <td>${s.enabled ? '✅' : '—'}</td>
      <td class="row">
        <button class="ghost" data-edit="${s.id}">编辑</button>
        <button class="danger" data-del="${s.id}">删除</button>
      </td>
    </tr>`).join('');
  $('#server-table tbody').innerHTML = rows || '<tr><td colspan="9" class="muted">暂无节点</td></tr>';
  $$('#server-table [data-edit]').forEach((b) => b.addEventListener('click', () => {
    openServerModal(serverCache.find((s) => s.id === Number(b.dataset.edit)));
  }));
  $$('#server-table [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确认删除该节点？')) return;
    await api(`/api/admin/servers/${b.dataset.del}`, { method: 'DELETE' });
    loadServers();
  }));
}

function openServerModal(s) {
  const isEdit = !!s;
  const ps = JSON.stringify(s?.protocol_settings ?? TYPE_PRESETS.vless, null, 2);
  openModal(isEdit ? `编辑节点 #${s.id}` : '新建节点', `
    <div class="form-grid">
      <div><label>名称</label><input id="f-name" value="${esc(s?.name ?? '')}" placeholder="香港-01"></div>
      <div><label>Code（可选别名，后端 NodeID 可填它）</label><input id="f-code" value="${esc(s?.code ?? '')}"></div>
      <div><label>类型</label><select id="f-type">
        ${['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria', 'tuic'].map((t) =>
          `<option value="${t}" ${s?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
      <div><label>地址 host</label><input id="f-host" value="${esc(s?.host ?? '')}" placeholder="hk.example.com"></div>
      <div><label>客户端端口 port（可填 1000-2000 动态）</label><input id="f-port" value="${esc(s?.port ?? '')}" placeholder="443"></div>
      <div><label>服务端口 server_port</label><input id="f-server-port" type="number" value="${s?.server_port ?? ''}"></div>
      <div><label>排序</label><input id="f-sort" type="number" value="${s?.sort ?? 0}"></div>
      <div><label>标签（逗号分隔）</label><input id="f-tags" value="${esc((s?.tags ?? []).join(','))}" placeholder="香港,IEPL"></div>
    </div>
    <div class="row">
      <label class="row"><input id="f-show" type="checkbox" style="width:auto" ${s?.show !== 0 ? 'checked' : ''}> 订阅中显示</label>
      <label class="row"><input id="f-enabled" type="checkbox" style="width:auto" ${s?.enabled !== 0 ? 'checked' : ''}> 启用</label>
    </div>
    <label>协议参数 protocol_settings（JSON）
      <button class="ghost" id="f-preset" type="button">填入 ${s?.type ?? 'vless'} 预设</button>
    </label>
    <textarea id="f-ps" spellcheck="false">${esc(ps)}</textarea>
  `, async () => {
    let protocolSettings;
    try { protocolSettings = JSON.parse($('#f-ps').value || '{}'); }
    catch { throw new Error('protocol_settings 不是合法 JSON'); }
    const payload = {
      name: $('#f-name').value,
      code: $('#f-code').value || null,
      type: $('#f-type').value,
      host: $('#f-host').value,
      port: $('#f-port').value,
      server_port: Number($('#f-server-port').value || 0),
      sort: Number($('#f-sort').value || 0),
      tags: $('#f-tags').value.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
      show: $('#f-show').checked,
      enabled: $('#f-enabled').checked,
      protocol_settings: protocolSettings,
    };
    if (isEdit) await api(`/api/admin/servers/${s.id}`, { method: 'PUT', body: payload });
    else await api('/api/admin/servers', { method: 'POST', body: payload });
    toast('已保存');
    loadServers();
  });
  $('#f-preset').addEventListener('click', () => {
    $('#f-ps').value = JSON.stringify(TYPE_PRESETS[$('#f-type').value] ?? {}, null, 2);
  });
  $('#f-type').addEventListener('change', () => {
    $('#f-ps').value = JSON.stringify(TYPE_PRESETS[$('#f-type').value] ?? {}, null, 2);
  });
}

$('#server-new').addEventListener('click', () => openServerModal(null));

/* ---------- 用户 ---------- */

let userCache = [];

async function loadUsers() {
  userCache = await api('/api/admin/users');
  $('#user-table tbody').innerHTML = userCache.map((u) => `
    <tr>
      <td>${u.id}</td>
      <td>${esc(u.email)}</td>
      <td><code>${esc(u.uuid)}</code> <button class="ghost" data-copy="${esc(u.uuid)}">复制</button></td>
      <td>${u.enabled ? '✅' : '—'}</td>
      <td class="row">
        <button class="ghost" data-edit="${u.id}">编辑</button>
        <button class="danger" data-del="${u.id}">删除</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">暂无凭据</td></tr>';
  $$('#user-table [data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
  $$('#user-table [data-edit]').forEach((b) => b.addEventListener('click', () => {
    openUserModal(userCache.find((u) => u.id === Number(b.dataset.edit)));
  }));
  $$('#user-table [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确认删除该凭据？使用它的订阅将失效。')) return;
    await api(`/api/admin/users/${b.dataset.del}`, { method: 'DELETE' });
    loadUsers();
  }));
}

function openUserModal(u) {
  openModal(u ? `编辑凭据 #${u.id}` : '新建凭据', `
    <label>备注 email</label><input id="f-email" value="${esc(u?.email ?? '')}" placeholder="我的手机">
    <label>UUID（留空自动生成）</label><input id="f-uuid" value="${esc(u?.uuid ?? '')}">
    <div class="row" style="margin-top:12px">
      <label class="row"><input id="f-u-enabled" type="checkbox" style="width:auto" ${u?.enabled !== 0 ? 'checked' : ''}> 启用</label>
    </div>
  `, async () => {
    const payload = {
      email: $('#f-email').value,
      uuid: $('#f-uuid').value,
      enabled: $('#f-u-enabled').checked,
    };
    if (u) await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: payload });
    else await api('/api/admin/users', { method: 'POST', body: payload });
    toast('已保存');
    loadUsers();
  });
}

$('#user-new').addEventListener('click', () => openUserModal(null));

/* ---------- 订阅 ---------- */

let subCache = [];

function subUrl(token) {
  return `${location.origin}/s/${token}`;
}

async function loadSubs() {
  subCache = await api('/api/admin/subscriptions');
  $('#sub-table tbody').innerHTML = subCache.map((s) => `
    <tr>
      <td>${s.id}</td>
      <td>${esc(s.name)}</td>
      <td>#${s.user_id}</td>
      <td><code>${esc(subUrl(s.token))}</code></td>
      <td class="row">
        <button class="ghost" data-copy="${esc(subUrl(s.token))}">复制</button>
        <button class="ghost" data-rotate="${s.id}">轮换</button>
        <button class="ghost" data-edit="${s.id}">编辑</button>
        <button class="danger" data-del="${s.id}">删除</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">暂无订阅</td></tr>';
  $$('#sub-table [data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
  $$('#sub-table [data-rotate]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('轮换后旧链接立即失效，确认？')) return;
    await api(`/api/admin/subscriptions/${b.dataset.rotate}/rotate`, { method: 'POST' });
    toast('已轮换');
    loadSubs();
  }));
  $$('#sub-table [data-edit]').forEach((b) => b.addEventListener('click', () => {
    openSubModal(subCache.find((s) => s.id === Number(b.dataset.edit)));
  }));
  $$('#sub-table [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确认删除该订阅？')) return;
    await api(`/api/admin/subscriptions/${b.dataset.del}`, { method: 'DELETE' });
    loadSubs();
  }));
}

function openSubModal(s) {
  const f = s?.filter_json ?? {};
  openModal(s ? `编辑订阅 #${s.id}` : '新建订阅', `
    <label>名称</label><input id="f-s-name" value="${esc(s?.name ?? '')}" placeholder="我的订阅">
    <label>绑定凭据</label><select id="f-s-user">
      ${userCache.map((u) => `<option value="${u.id}" ${s?.user_id === u.id ? 'selected' : ''}>#${u.id} ${esc(u.email)}</option>`).join('')}
    </select>
    <label>协议过滤 types（留空=全部，逗号分隔）</label>
    <input id="f-s-types" value="${esc((f.types ?? []).join(','))}" placeholder="vless,trojan">
    <label>关键词过滤（匹配名称/标签，逗号分隔）</label>
    <input id="f-s-keywords" value="${esc((f.keywords ?? []).join(','))}" placeholder="香港,IEPL">
  `, async () => {
    const payload = {
      name: $('#f-s-name').value,
      user_id: Number($('#f-s-user').value),
      filter: {
        types: $('#f-s-types').value.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
        keywords: $('#f-s-keywords').value.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
      },
    };
    if (s) await api(`/api/admin/subscriptions/${s.id}`, { method: 'PUT', body: payload });
    else await api('/api/admin/subscriptions', { method: 'POST', body: payload });
    toast('已保存');
    loadSubs();
  });
}

$('#sub-new').addEventListener('click', () => {
  if (!userCache.length) return toast('请先创建用户凭据');
  openSubModal(null);
});

/* ---------- 设置 ---------- */

async function loadSettings() {
  const s = await api('/api/admin/settings');
  $('#server-token').textContent = s.server_token;
  $('#subscribe-path').value = s.subscribe_path;
  $('#pull-interval').value = s.pull_interval;
  $('#push-interval').value = s.push_interval;
}

$('#token-copy').addEventListener('click', () => copy($('#server-token').textContent));
$('#token-rotate').addEventListener('click', async () => {
  if (!confirm('轮换后所有节点后端需同步更新 ApiKey，确认？')) return;
  const d = await api('/api/admin/settings/server-token/rotate', { method: 'POST' });
  $('#server-token').textContent = d.server_token;
  toast('已轮换');
});
$('#settings-save').addEventListener('click', async () => {
  await api('/api/admin/settings', { method: 'PUT', body: { subscribe_path: $('#subscribe-path').value } });
  toast('已保存');
});
$('#interval-save').addEventListener('click', async () => {
  await api('/api/admin/settings', {
    method: 'PUT',
    body: { pull_interval: $('#pull-interval').value, push_interval: $('#push-interval').value },
  });
  toast('已保存');
});

init();
