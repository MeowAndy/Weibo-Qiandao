const socket = io();
const $ = (id) => document.getElementById(id);

let accounts = [];
let expandedAccounts = new Set();

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmt(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('zh-CN');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function cookieBadge(a) {
  if (!a.cookie_file_exists) return '<span class="badge bad">未登录 / 未保存 Cookie</span>';
  if (!a.cookie_expires_at) return '<span class="badge warn">Cookie 已保存，到期未知</span>';
  const expired = new Date(a.cookie_expires_at).getTime() <= Date.now();
  return `<span class="badge ${expired ? 'bad' : 'ok'}">${expired ? 'Cookie 已过期' : 'Cookie 有效'}</span>`;
}

function logLine(row) {
  return `[${row.created_at || row.createdAt}] ${row.action}: ${row.message}`;
}

function accountLogsHtml(a) {
  const logs = Array.isArray(a.logs) ? a.logs.slice(-80) : [];
  if (!logs.length) return '<pre class="logs account-logs">暂无该账号运行日志</pre>';
  return `<pre class="logs account-logs">${escapeHtml(logs.map(logLine).join('\n'))}</pre>`;
}

function upsertAccount(account) {
  const index = accounts.findIndex((item) => String(item.id) === String(account.id));
  if (index >= 0) accounts[index] = { ...account, logs: account.logs?.length ? account.logs : (accounts[index].logs || []) };
  else accounts.unshift(account);
  renderAccounts();
}

function pushAccountLog(row) {
  const account = accounts.find((item) => String(item.id) === String(row.accountId));
  if (!account) return;
  account.logs = account.logs || [];
  account.logs.push({ action: row.action, message: row.message, created_at: row.createdAt });
  account.logs = account.logs.slice(-120);
  appendAccountLog(account.id, row);
}

function updateAccountLogBox(accountId) {
  const account = accounts.find((item) => String(item.id) === String(accountId));
  const box = document.querySelector(`[data-log-box="${accountId}"]`);
  if (!account || !box) return;
  const pre = box.querySelector('pre');
  const shouldStick = !pre || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  box.innerHTML = `<div class="account-log-head"><h3>该账号运行日志</h3><button class="ghost small" data-clear-logs="${accountId}">清理日志</button></div>${accountLogsHtml(account)}`;
  const nextPre = box.querySelector('pre');
  if (nextPre && shouldStick) nextPre.scrollTop = nextPre.scrollHeight;
}

function appendAccountLog(accountId, row) {
  const box = document.querySelector(`[data-log-box="${accountId}"]`);
  if (!box) return;
  const pre = box.querySelector('pre');
  if (!pre || pre.textContent === '暂无该账号运行日志') return updateAccountLogBox(accountId);
  const shouldStick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  pre.textContent += `\n${logLine({ action: row.action, message: row.message, created_at: row.createdAt })}`;
  if (shouldStick) pre.scrollTop = pre.scrollHeight;
}

function renderAccounts() {
  const box = $('accounts');
  if (!accounts.length) {
    box.innerHTML = '<div class="empty-card">暂无账号，请先添加。</div>';
    return;
  }

  box.innerHTML = accounts.map((a) => {
    const loggedIn = !!a.cookie_file_exists;
    const expanded = expandedAccounts.has(String(a.id)) || !loggedIn;
    const duplicate = /重复账号/.test(a.last_status || '');
    return `
    <article class="account-card ${loggedIn && !expanded ? 'collapsed' : ''} ${duplicate ? 'duplicate' : ''}">
      <div class="account-main">
        <div class="identity">
          <div class="avatar">${escapeHtml((a.name || '微').slice(0, 1))}</div>
          <div>
            <input class="name-edit" data-id="${a.id}" value="${escapeHtml(a.name)}" />
            <div class="account-sub">账号 ID：${a.id} ${a.auto_named ? '· 已自动识别昵称' : '· 扫码登录后会自动识别昵称'}</div>
          </div>
        </div>
        <button class="ghost" data-toggle="${a.id}">${expanded ? '收起' : '展开'}</button>
        <label class="switch">
          <input type="checkbox" data-enable="${a.id}" ${a.enabled ? 'checked' : ''} />
          <span>启用定时</span>
        </label>
      </div>
      <div class="meta ${expanded ? '' : 'hidden'}">
        <span>定时：<input type="time" data-time="${a.id}" value="${a.schedule_time || '08:30'}" /></span>
        <span>登录：${fmt(a.last_login_at)}</span>
        <span>签到：${fmt(a.last_checkin_at)}</span>
        <span>状态：${escapeHtml(a.last_status || '-')}</span>
        <span>Cookie：${cookieBadge(a)}</span>
        <span>Cookie 到期：${escapeHtml(a.cookie_expires_text || '-')}</span>
      </div>
      <div class="actions ${expanded ? '' : 'hidden'}">
        <button data-login="${a.id}">刷新 Cookie / 重新登录</button>
        <button data-checkin="${a.id}">立即签到</button>
        <button class="danger" data-delete="${a.id}">删除</button>
      </div>
      <div class="notify-config ${expanded ? '' : 'hidden'}">
        <h3>该账号的通知设置</h3>
        <p class="hint">企业微信仍按账号单独配置；邮件只设置该账号的收件人，发件 SMTP 在上方统一配置。</p>
        <div class="form-row settings-row">
          <label><input type="checkbox" data-wx-enabled="${a.id}" ${a.wechat?.enabled ? 'checked' : ''} /> 启用企业微信</label>
          <input data-wx-corpid="${a.id}" placeholder="企业 ID / CorpID" value="${escapeHtml(a.wechat?.corpId || '')}" />
          <input data-wx-secret="${a.id}" placeholder="应用 Secret" type="password" value="${escapeHtml(a.wechat?.corpSecret || '')}" />
          <input data-wx-agentid="${a.id}" placeholder="应用 AgentID" value="${escapeHtml(a.wechat?.agentId || '')}" />
          <input data-wx-touser="${a.id}" placeholder="接收人 UserID，默认 @all" value="${escapeHtml(a.wechat?.toUser || '@all')}" />
          <button data-save-wx="${a.id}">保存企业微信</button>
          <button data-test-wx="${a.id}">测试企业微信</button>
        </div>
        <div class="form-row settings-row email-row">
          <label><input type="checkbox" data-email-enabled="${a.id}" ${a.email?.enabled ? 'checked' : ''} /> 启用邮件</label>
          <input data-email-to="${a.id}" placeholder="该账号收件邮箱" value="${escapeHtml(a.email?.to || '')}" />
          <button data-save-email="${a.id}">保存邮箱</button>
          <button data-test-email="${a.id}">测试邮件</button>
        </div>
      </div>
      <div class="account-log-box ${expanded ? '' : 'hidden'}" data-log-box="${a.id}">
        <div class="account-log-head"><h3>该账号运行日志</h3><button class="ghost small" data-clear-logs="${a.id}">清理日志</button></div>
        ${accountLogsHtml(a)}
      </div>
    </article>
  `}).join('');
}

async function loadSmtpSettings() {
  const s = await api('/api/settings/smtp');
  $('smtpEnabled').checked = !!s.enabled;
  $('smtpHost').value = s.host || '';
  $('smtpPort').value = s.port || 465;
  $('smtpSecure').checked = !!s.secure;
  $('smtpUser').value = s.user || '';
  $('smtpPass').value = s.pass || '';
  $('smtpFrom').value = s.from || '';
}

async function load() {
  accounts = await api('/api/accounts');
  renderAccounts();
  await loadSmtpSettings();
}

$('addBtn').onclick = async () => {
  const name = $('nameInput').value.trim() || '微博账号';
  const scheduleTime = $('timeInput').value || '08:30';
  await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name, scheduleTime }) });
  $('nameInput').value = '';
  await load();
};

$('refreshBtn').onclick = load;

$('saveSmtpBtn').onclick = async () => {
  try {
    await api('/api/settings/smtp', {
      method: 'POST',
      body: JSON.stringify({
        setupKey: $('smtpSetupKey').value.trim(),
        enabled: $('smtpEnabled').checked,
        host: $('smtpHost').value.trim(),
        port: $('smtpPort').value.trim(),
        secure: $('smtpSecure').checked,
        user: $('smtpUser').value.trim(),
        pass: $('smtpPass').value.trim(),
        from: $('smtpFrom').value.trim()
      })
    });
    $('smtpStatus').textContent = 'SMTP 配置已保存';
    await loadSmtpSettings();
  } catch (err) {
    $('smtpStatus').textContent = `保存失败：${err.message}`;
  }
};

$('testSmtpBtn').onclick = async () => {
  try {
    await api('/api/settings/smtp/test', {
      method: 'POST',
      body: JSON.stringify({ setupKey: $('smtpSetupKey').value.trim(), to: $('smtpTestTo').value.trim() })
    });
    $('smtpStatus').textContent = 'SMTP 测试邮件已发送';
  } catch (err) {
    $('smtpStatus').textContent = `测试失败：${err.message}`;
  }
};

$('accounts').addEventListener('click', async (e) => {
  const loginId = e.target.dataset.login;
  const checkinId = e.target.dataset.checkin;
  const deleteId = e.target.dataset.delete;
  const toggleId = e.target.dataset.toggle;
  const saveWxId = e.target.dataset.saveWx;
  const testWxId = e.target.dataset.testWx;
  const saveEmailId = e.target.dataset.saveEmail;
  const testEmailId = e.target.dataset.testEmail;
  const clearLogsId = e.target.dataset.clearLogs;
  if (toggleId) {
    if (expandedAccounts.has(String(toggleId))) expandedAccounts.delete(String(toggleId));
    else expandedAccounts.add(String(toggleId));
    renderAccounts();
    return;
  }
  if (clearLogsId && confirm('确认清理该账号的运行日志？')) {
    await api(`/api/accounts/${clearLogsId}/logs`, { method: 'DELETE' });
    const account = accounts.find((item) => String(item.id) === String(clearLogsId));
    if (account) account.logs = [];
    updateAccountLogBox(clearLogsId);
    return;
  }
  if (saveWxId) {
    const card = e.target.closest('.account-card');
    await api(`/api/accounts/${saveWxId}/wechat`, {
      method: 'POST',
      body: JSON.stringify({
        enabled: card.querySelector('[data-wx-enabled]').checked,
        corpId: card.querySelector('[data-wx-corpid]').value.trim(),
        corpSecret: card.querySelector('[data-wx-secret]').value.trim(),
        agentId: card.querySelector('[data-wx-agentid]').value.trim(),
        toUser: card.querySelector('[data-wx-touser]').value.trim() || '@all'
      })
    });
    await load();
    return;
  }
  if (testWxId) {
    try {
      await api(`/api/accounts/${testWxId}/test-wechat`, { method: 'POST' });
    } catch (err) {
      alert(`测试失败：${err.message}`);
    }
    await load();
    return;
  }
  if (saveEmailId) {
    const card = e.target.closest('.account-card');
    await api(`/api/accounts/${saveEmailId}/email`, {
      method: 'POST',
      body: JSON.stringify({
        enabled: card.querySelector('[data-email-enabled]').checked,
        to: card.querySelector('[data-email-to]').value.trim()
      })
    });
    await load();
    return;
  }
  if (testEmailId) {
    try {
      await api(`/api/accounts/${testEmailId}/test-email`, { method: 'POST' });
    } catch (err) {
      alert(`测试失败：${err.message}`);
    }
    await load();
    return;
  }
  if (loginId) {
    expandedAccounts.add(String(loginId));
    $('qrBox').className = 'qr-box empty';
    $('qrBox').textContent = '正在刷新 Cookie，请等待二维码...';
    await api(`/api/accounts/${loginId}/login`, { method: 'POST' });
  }
  if (checkinId) {
    await api(`/api/accounts/${checkinId}/checkin`, { method: 'POST' });
  }
  if (deleteId && confirm('危险操作：确认删除这个账号？会同时彻底删除该账号文件夹和日志。')) {
    await api(`/api/accounts/${deleteId}`, { method: 'DELETE' });
    await load();
  }
});

$('accounts').addEventListener('change', async (e) => {
  const id = e.target.dataset.enable || e.target.dataset.time;
  if (!id) return;
  const card = e.target.closest('.account-card');
  const enabled = card.querySelector('[data-enable]').checked;
  const scheduleTime = card.querySelector('[data-time]').value;
  const name = card.querySelector('.name-edit').value;
  await api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ name, enabled, scheduleTime }) });
  await load();
});

$('accounts').addEventListener('blur', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  const account = accounts.find((x) => String(x.id) === String(id));
  if (!account || account.name === e.target.value) return;
  await api(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ name: e.target.value }) });
  await load();
}, true);

socket.on('qr', (data) => {
  $('qrBox').className = 'qr-box';
  $('qrBox').innerHTML = `
    <iframe class="qr-frame" src="${data.url}" title="微博登录二维码"></iframe>
    <p>账号 ID：${data.accountId}</p>
    <a href="${data.url}" target="_blank" rel="noreferrer">打开二维码链接</a>
    <p class="hint">这里直接打开 JAR 输出的登录二维码链接。请用微博扫码，扫码完成后会刷新该账号 Cookie；需要签到请再点“立即签到”。</p>
  `;
});

socket.on('log', (row) => {
  pushAccountLog(row);
});

socket.on('accountUpdated', (account) => {
  upsertAccount(account);
});

socket.on('accountLogsCleared', ({ accountId }) => {
  const account = accounts.find((item) => String(item.id) === String(accountId));
  if (account) account.logs = [];
  updateAccountLogBox(accountId);
});

load().catch((err) => {
  const box = $('accounts');
  if (box) box.innerHTML = `<div class="empty-card">加载失败：${escapeHtml(err.message)}</div>`;
});
