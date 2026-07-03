const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { TextDecoder } = require('util');
const https = require('https');
const dns = require('dns').promises;
const nodemailer = require('nodemailer');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');

const ROOT = __dirname;
const configPath = path.join(ROOT, 'config.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));

const DATA_DIR = path.join(ROOT, 'data');
const ACCOUNT_DIR = path.join(DATA_DIR, 'accounts');
fs.mkdirSync(ACCOUNT_DIR, { recursive: true });
const smtpResolver = new dns.Resolver();
smtpResolver.setServers(config.smtpDnsServers || ['223.5.5.5', '119.29.29.29', '8.8.8.8']);

const STORE_FILE = path.join(DATA_DIR, 'store.json');
let store = loadStore();
store.logs = store.logs.filter((log) => !String(log.message || '').includes('�'));
saveStore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const activeRuns = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

function now() {
  return new Date().toISOString();
}

const outputDecoder = new TextDecoder(config.outputEncoding || 'gbk');

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) {
    return { nextAccountId: 1, nextLogId: 1, accounts: [], logs: [], settings: defaultSettings() };
  }
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      nextAccountId: data.nextAccountId || 1,
      nextLogId: data.nextLogId || 1,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      settings: { ...defaultSettings(), ...(data.settings || {}) }
    };
  } catch {
    return { nextAccountId: 1, nextLogId: 1, accounts: [], logs: [], settings: defaultSettings() };
  }
}

function defaultSettings() {
  return { smtp: defaultSmtpConfig() };
}

function defaultSmtpConfig() {
  return { enabled: false, host: '', port: 465, secure: true, user: '', pass: '', from: '' };
}

function defaultWechatConfig() {
  return { enabled: false, corpId: '', corpSecret: '', agentId: '', toUser: '@all' };
}

function defaultEmailConfig() {
  return { enabled: false, to: '' };
}

function saveStore() {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function nextAvailableAccountId() {
  const used = new Set(store.accounts.map((account) => Number(account.id)).filter(Number.isInteger));
  let id = 1;
  while (used.has(id)) id += 1;
  return id;
}

function resetNextAccountId() {
  store.nextAccountId = nextAvailableAccountId();
}

function jarPath() {
  return path.resolve(ROOT, config.jarPath || '../WeiboComCheckin.jar');
}

function decodeOutput(buf) {
  return outputDecoder.decode(buf, { stream: true });
}

function normalizeText(text) {
  return String(text || '').replace(/\u0000/g, '').trim();
}

function extractNickname(text) {
  const normalized = normalizeText(text);
  const patterns = [
    /(?:昵称|用户|账号|用户名|登录用户|当前用户)[:：\s]+([^\r\n，,。]+)/i,
    /([^\r\n，,。\s]+)\s*(?:登录成功|扫码登录成功|登陆成功)/i,
    /(?:登录成功|扫码登录成功|登陆成功)[:：\s]+([^\r\n，,。]+)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name && !/^https?:\/\//i.test(name) && name.length <= 50) return name;
    }
  }
  return null;
}

function readCookieSummary(account) {
  const dbPath = path.join(account.workdir, 'cookies.db');
  const summary = { cookie_file_exists: fs.existsSync(dbPath), cookie_file: dbPath, cookie_expires_at: null, cookie_expires_text: '未找到 Cookie', cookie_identity: null };
  if (!summary.cookie_file_exists) return summary;
  try {
    const bytes = fs.readFileSync(dbPath);
    const ascii = bytes.toString('latin1');
    const sub = ascii.match(/SUB_2A25[A-Za-z0-9_\-.]+/);
    const subp = ascii.match(/SUBP[0-9A-Za-z_.\-]+/);
    summary.cookie_identity = sub?.[0] || subp?.[0] || null;
    const values = [];
    for (const match of ascii.matchAll(/(?:ALF|SSOLoginState|LT|SRF)(\d{10})/g)) {
      const ts = Number(match[1]);
      if (ts > 946656000 && ts < 4102444800) values.push(ts);
    }
    if (values.length) {
      const max = Math.max(...values);
      summary.cookie_expires_at = new Date(max * 1000).toISOString();
      summary.cookie_expires_text = new Date(max * 1000).toLocaleString('zh-CN');
    } else {
      summary.cookie_expires_text = '已保存，未识别到期时间';
    }
  } catch (err) {
    summary.cookie_expires_text = `读取失败：${err.message}`;
  }
  return summary;
}

function refreshAccountRuntimeInfo(account) {
  if (!account) return account;
  Object.assign(account, readCookieSummary(account));
  return account;
}

function findDuplicateAccount(account) {
  refreshAccountRuntimeInfo(account);
  if (!account.cookie_identity) return null;
  return store.accounts.find((item) => {
    if (item.id === account.id) return false;
    refreshAccountRuntimeInfo(item);
    return item.cookie_identity && item.cookie_identity === account.cookie_identity;
  });
}

function writeLog(accountId, action, message) {
  const text = String(message || '').trimEnd();
  const row = { id: store.nextLogId++, account_id: accountId || null, action, message: text, created_at: now() };
  store.logs.push(row);
  if (store.logs.length > 2000) store.logs = store.logs.slice(-2000);
  saveStore();
  io.emit('log', { accountId, action, message: text, createdAt: row.created_at });
}

function getAccountLogs(accountId, limit = 120) {
  return store.logs.filter((log) => String(log.account_id) === String(accountId)).slice(-limit);
}

function httpsJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(url, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) } : undefined
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendWechatMessage(account, title, description) {
  const s = { ...defaultWechatConfig(), ...(account.wechat || {}) };
  if (!s.enabled) return { skipped: true, reason: '该账号未启用企业微信通知' };
  if (!s.corpId || !s.corpSecret || !s.agentId) throw new Error('该账号企业微信配置不完整');
  const tokenResult = await httpsJson(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(s.corpId)}&corpsecret=${encodeURIComponent(s.corpSecret)}`);
  if (!tokenResult.access_token) throw new Error(`获取企业微信 token 失败：${tokenResult.errmsg || JSON.stringify(tokenResult)}`);
  const sendResult = await httpsJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(tokenResult.access_token)}`, {
    touser: s.toUser || '@all',
    msgtype: 'textcard',
    agentid: Number(s.agentId),
    textcard: {
      title,
      description,
      url: 'https://weibo.com',
      btntxt: '查看微博'
    }
  });
  if (sendResult.errcode !== 0) throw new Error(`发送企业微信失败：${sendResult.errmsg || JSON.stringify(sendResult)}`);
  return sendResult;
}

function publicSmtpSettings() {
  const smtp = { ...defaultSmtpConfig(), ...(store.settings.smtp || {}) };
  smtp.pass = smtp.pass ? '******' : '';
  return smtp;
}

function requireSmtpSetupKey(req) {
  const expected = config.smtpSetupKey;
  if (!expected || expected === 'change-this-smtp-key') throw new Error('请先在 config.json 设置 smtpSetupKey');
  if (req.body.setupKey !== expected) throw new Error('SMTP 设置秘钥不正确');
}

function isFakeIp(address) {
  return /^198\.(?:18|19)\./.test(String(address || ''));
}

async function resolveSmtpHost(hostname) {
  const candidates = [];
  try { candidates.push(...await smtpResolver.resolve4(hostname)); } catch {}
  try { candidates.push(...await dns.resolve4(hostname)); } catch {}
  return candidates.find((address) => !isFakeIp(address)) || hostname;
}

async function sendSmtpMail(to, subject, html) {
  const smtp = { ...defaultSmtpConfig(), ...(store.settings.smtp || {}) };
  if (!smtp.enabled) return { skipped: true, reason: 'SMTP 未启用' };
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) throw new Error('SMTP 配置不完整');
  if (!to) throw new Error('收件人邮箱未设置');
  const host = await resolveSmtpHost(smtp.host);
  const tls = host === smtp.host ? {} : { servername: smtp.host };
  const transporter = nodemailer.createTransport({
    host,
    port: Number(smtp.port),
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls
  });
  return transporter.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject,
    html
  });
}

async function sendAccountNotifications(account, title, html) {
  const jobs = [];
  jobs.push(
    sendWechatMessage(account, title, html)
      .then((result) => {
        if (!result?.skipped) writeLog(account.id, 'wechat', '企业微信签到通知已发送');
      })
      .catch((err) => writeLog(account.id, 'wechat', err.message))
  );
  const email = { ...defaultEmailConfig(), ...(account.email || {}) };
  if (email.enabled && email.to) {
    jobs.push(
      sendSmtpMail(email.to, title, html)
        .then(() => writeLog(account.id, 'email', `邮件签到通知已发送：${email.to}`))
        .catch((err) => writeLog(account.id, 'email', err.message))
    );
  }
  await Promise.allSettled(jobs);
}

function getAccount(id) {
  return store.accounts.find((account) => String(account.id) === String(id));
}

function publicAccount(account) {
  if (!account) return account;
  const data = { ...refreshAccountRuntimeInfo(account) };
  data.wechat = { ...defaultWechatConfig(), ...(data.wechat || {}) };
  data.wechat.corpSecret = data.wechat.corpSecret ? '******' : '';
  data.email = { ...defaultEmailConfig(), ...(data.email || {}) };
  data.logs = getAccountLogs(account.id);
  return data;
}

function sanitizeName(name) {
  return String(name || 'account').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50) || 'account';
}

function parseQrUrl(line) {
  const matches = String(line).match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches) return null;
  return matches.find((url) => /qr|qrcode|weibo|sina|login|passport/i.test(url)) || matches[0];
}

function runKey(account, action) {
  return `${account.id}:${action}`;
}

function stopActiveRun(account, action, reason) {
  const key = runKey(account, action);
  const active = activeRuns.get(key);
  if (!active) return false;
  writeLog(account.id, action, reason || '已停止上一次未结束的进程');
  try { active.kill('SIGTERM'); } catch {}
  activeRuns.delete(key);
  return true;
}

function isLoginSuccessText(text) {
  return /登录成功|登陆成功|扫码登录成功|UID\s*[:：]/i.test(String(text || ''));
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function extractCheckinSummary(output) {
  const text = String(output || '').replace(/\u001b\[[0-9;]*m/g, '').replace(/<br\s*\/?>(\r?\n)?/gi, '\n');
  const summary = text.match(/本次签到[:：][^\r\n。]*(?:。)?/);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^【.+?】[:：]/.test(line) || /本次签到[:：]/.test(line));
  if (!lines.length && summary) lines.push(summary[0].trim());
  return lines.join('\n');
}

function runJar(account, action, onQr) {
  return new Promise((resolve) => {
    const key = runKey(account, action);
    const cp = spawn(config.javaPath || 'java', ['-jar', jarPath(), action], {
      cwd: account.workdir,
      windowsHide: true,
      env: { ...process.env }
    });
    activeRuns.set(key, cp);

    let output = '';
    let qrEmitted = false;
    let successDetected = false;

    const handle = async (buf) => {
      const text = decodeOutput(buf);
      output += text;
      writeLog(account.id, action, text);
      if (action === 'login' && !successDetected && isLoginSuccessText(text)) {
        successDetected = true;
        writeLog(account.id, action, '已确认扫码登录成功，正在结束刷新 Cookie 进程');
        setTimeout(() => {
          try { cp.kill('SIGTERM'); } catch {}
        }, 500);
      }
      const nickname = extractNickname(text);
      if (nickname && (!account.auto_named || /^微博账号/.test(account.name))) {
        account.name = nickname;
        account.auto_named = 1;
        saveStore();
        io.emit('accountUpdated', publicAccount(account));
      }
      for (const line of text.split(/\r?\n/)) {
        const qrUrl = parseQrUrl(line);
        if (qrUrl && !qrEmitted) {
          qrEmitted = true;
          onQr && onQr({ url: qrUrl });
          io.emit('qr', { accountId: account.id, url: qrUrl });
        }
      }
    };

    cp.stdout.on('data', handle);
    cp.stderr.on('data', handle);
    cp.on('error', (err) => {
      writeLog(account.id, action, `启动失败：${err.message}`);
      if (activeRuns.get(key) === cp) activeRuns.delete(key);
      resolve({ code: -1, output });
    });
    cp.on('close', (code) => {
      if (activeRuns.get(key) === cp) activeRuns.delete(key);
      writeLog(account.id, action, `进程结束，退出码：${code}`);
      resolve({ code: successDetected && action === 'login' ? 0 : code, output, successDetected });
    });
  });
}

async function checkinAccount(accountId) {
  const account = getAccount(accountId);
  if (!account) throw new Error('账号不存在');
  const result = await runJar(account, 'checkin');
  account.last_checkin_at = now();
  account.last_status = result.code === 0 ? '签到完成' : `签到失败：${result.code}`;
  refreshAccountRuntimeInfo(account);
  saveStore();
  io.emit('accountUpdated', publicAccount(account));
  if (result.code === 0) {
    const summary = extractCheckinSummary(result.output);
    const detailHtml = summary ? `<br><br><b>签到结果：</b><pre style="white-space:pre-wrap;line-height:1.6">${escapeHtml(summary)}</pre>` : '';
    sendAccountNotifications(account, '微博超话签到成功', `账号：${escapeHtml(account.name)}<br>时间：${new Date().toLocaleString('zh-CN')}<br>状态：签到完成${detailHtml}`);
  }
  return result;
}

let scheduledJobs = new Map();
function reloadSchedules() {
  for (const job of scheduledJobs.values()) job.stop();
  scheduledJobs.clear();

  const accounts = store.accounts.filter((account) => account.enabled);
  for (const account of accounts) {
    const [hour, minute] = String(account.schedule_time || config.defaultSchedule || '08:30').split(':').map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
    const expr = `${minute} ${hour} * * *`;
    const job = cron.schedule(expr, () => {
      writeLog(account.id, 'schedule', `定时任务触发：${account.schedule_time}`);
      checkinAccount(account.id).catch((err) => writeLog(account.id, 'checkin', err.message));
    });
    scheduledJobs.set(account.id, job);
  }
}

function requireToken(req, res, next) {
  if (!config.adminToken || config.adminToken === 'change-this-token') return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token !== config.adminToken) return res.status(401).json({ error: '未授权' });
  next();
}

app.use('/api', requireToken);

app.get('/api/accounts', (req, res) => {
  res.json([...store.accounts].sort((a, b) => b.id - a.id).map(publicAccount));
});

app.get('/api/settings/smtp', (req, res) => {
  res.json(publicSmtpSettings());
});

app.post('/api/settings/smtp', (req, res) => {
  try {
    requireSmtpSetupKey(req);
    const old = { ...defaultSmtpConfig(), ...(store.settings.smtp || {}) };
    store.settings.smtp = {
      enabled: !!req.body.enabled,
      host: req.body.host ?? old.host,
      port: Number(req.body.port || old.port || 465),
      secure: req.body.secure == null ? old.secure : !!req.body.secure,
      user: req.body.user ?? old.user,
      pass: req.body.pass && req.body.pass !== '******' ? req.body.pass : old.pass,
      from: req.body.from ?? old.from
    };
    saveStore();
    res.json(publicSmtpSettings());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/settings/smtp/test', async (req, res) => {
  try {
    requireSmtpSetupKey(req);
    await sendSmtpMail(req.body.to, '微博超话签到 Web SMTP 测试', `如果收到这封邮件，说明 SMTP 配置成功。<br>时间：${new Date().toLocaleString('zh-CN')}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  const name = req.body.name || `微博账号 ${Date.now()}`;
  const scheduleTime = req.body.scheduleTime || config.defaultSchedule || '08:30';
  const dirName = `${Date.now()}_${sanitizeName(name)}`;
  const workdir = path.join(ACCOUNT_DIR, dirName);
  fs.mkdirSync(workdir, { recursive: true });
  const account = {
    id: nextAvailableAccountId(),
    name,
    workdir,
    enabled: 1,
    schedule_time: scheduleTime,
    last_login_at: null,
    last_checkin_at: null,
    last_status: null,
    wechat: defaultWechatConfig(),
    email: defaultEmailConfig(),
    created_at: now()
  };
  store.accounts.push(account);
  resetNextAccountId();
  saveStore();
  reloadSchedules();
  res.json(publicAccount(account));
});

app.patch('/api/accounts/:id', (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  account.name = req.body.name ?? account.name;
  account.enabled = req.body.enabled == null ? account.enabled : (req.body.enabled ? 1 : 0);
  account.schedule_time = req.body.scheduleTime || account.schedule_time;
  saveStore();
  reloadSchedules();
  res.json(publicAccount(account));
});

app.delete('/api/accounts/:id', (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  store.accounts = store.accounts.filter((item) => item.id !== account.id);
  store.logs = store.logs.filter((log) => String(log.account_id) !== String(account.id));
  if (account.workdir && fs.existsSync(account.workdir)) {
    fs.rmSync(account.workdir, { recursive: true, force: true });
  }
  resetNextAccountId();
  saveStore();
  reloadSchedules();
  res.json({ ok: true });
});

app.delete('/api/accounts/:id/logs', (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  store.logs = store.logs.filter((log) => String(log.account_id) !== String(account.id));
  saveStore();
  io.emit('accountLogsCleared', { accountId: account.id });
  res.json({ ok: true });
});

app.post('/api/accounts/:id/email', (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  account.email = {
    enabled: !!req.body.enabled,
    to: req.body.to || ''
  };
  saveStore();
  res.json(publicAccount(account));
});

app.post('/api/accounts/:id/test-email', async (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  const email = { ...defaultEmailConfig(), ...(account.email || {}) };
  try {
    await sendSmtpMail(email.to, '微博超话签到 Web 邮件测试', `账号：${account.name}<br>如果收到这封邮件，说明该账号收件邮箱配置成功。<br>时间：${new Date().toLocaleString('zh-CN')}`);
    writeLog(account.id, 'email', `测试邮件已发送：${email.to}`);
    res.json({ ok: true });
  } catch (err) {
    writeLog(account.id, 'email', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/wechat', (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  const old = { ...defaultWechatConfig(), ...(account.wechat || {}) };
  account.wechat = {
    enabled: !!req.body.enabled,
    corpId: req.body.corpId ?? old.corpId,
    corpSecret: req.body.corpSecret && req.body.corpSecret !== '******' ? req.body.corpSecret : old.corpSecret,
    agentId: req.body.agentId ?? old.agentId,
    toUser: req.body.toUser || '@all'
  };
  saveStore();
  res.json(publicAccount(account));
});

app.post('/api/accounts/:id/test-wechat', async (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  try {
    await sendWechatMessage(account, '微博超话签到 Web 测试消息', `账号：${account.name}<br>如果收到这条消息，说明该账号企业微信通知配置成功。<br>时间：${new Date().toLocaleString('zh-CN')}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/:id/login', async (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  stopActiveRun(account, 'login', '检测到新的刷新 Cookie 请求，已停止上一次登录进程');
  writeLog(account.id, 'login', '开始刷新 Cookie，请在右侧二维码扫码登录');
  res.json({ ok: true, message: '刷新 Cookie 已启动，请在页面查看二维码。扫码完成后 Cookie 会更新。' });
  const result = await runJar(account, 'login');
  account.last_login_at = now();
  const loginOk = result.code === 0 || result.successDetected || /登录成功|登陆成功|扫码登录成功|UID\s*[:：]/i.test(result.output || '');
  account.last_status = loginOk ? 'Cookie 刷新完成' : `Cookie 刷新失败：${result.code}`;
  refreshAccountRuntimeInfo(account);
  const duplicate = loginOk ? findDuplicateAccount(account) : null;
  if (duplicate) {
    account.last_status = `重复账号：与 ID ${duplicate.id}（${duplicate.name}）相同`;
    writeLog(account.id, 'duplicate', account.last_status);
  }
  saveStore();
  io.emit('accountUpdated', publicAccount(account));
});

app.post('/api/accounts/:id/checkin', async (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) return res.status(404).json({ error: '账号不存在' });
  res.json({ ok: true, message: '签到已启动' });
  checkinAccount(account.id).catch((err) => writeLog(account.id, 'checkin', err.message));
});

app.get('/api/logs', (req, res) => {
  res.json(store.logs.slice(-300));
});

reloadSchedules();
server.listen(config.port || 3000, config.host || '0.0.0.0', () => {
  console.log(`WeiboComCheckin Web running at http://localhost:${config.port || 3000}`);
});
