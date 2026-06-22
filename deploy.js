'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib  = require('zlib');

const SA_PATH = process.argv[2];
if (!SA_PATH) {
  console.error('使い方: node deploy.js <サービスアカウントJSONパス>');
  process.exit(1);
}

const SITE_ID    = 'claudecode-39d5c';
const IGNORE     = new Set(['deploy.js', 'node_modules', '.git', '.firebaserc', 'firebase.json']);

// ── ユーティリティ ────────────────────────────────────────

function toB64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function apiRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : null;
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── 認証: サービスアカウント → OAuth2 アクセストークン ──

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header  = toB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toB64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform'
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${toB64url(sign.sign(sa.private_key))}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await apiRequest({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);

  if (!res.data.access_token) throw new Error('認証失敗: ' + JSON.stringify(res.data));
  return res.data.access_token;
}

// ── ファイル収集 ──────────────────────────────────────────

function collectFiles(dir, base = '') {
  const result = {};
  for (const entry of fs.readdirSync(dir)) {
    if (IGNORE.has(entry) || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const rel  = base + '/' + entry;
    if (fs.statSync(full).isDirectory()) {
      Object.assign(result, collectFiles(full, rel));
    } else {
      result[rel] = full;
    }
  }
  return result;
}

// ── ファイルアップロード ──────────────────────────────────

async function uploadFile(token, uploadUrl, hash, gzipped) {
  const u = new URL(uploadUrl + '/' + hash);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/octet-stream',
        'Content-Length': gzipped.length
      }
    }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.write(gzipped);
    req.end();
  });
}

// ── Firebase Hosting REST API ─────────────────────────────

function hosting(token) {
  return (path2, method, body) => apiRequest({
    hostname: 'firebasehosting.googleapis.com',
    path: '/v1beta1/' + path2, method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, body);
}

// ── メイン ───────────────────────────────────────────────

async function deploy() {
  console.log('🔑 サービスアカウント読み込み中...');
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));

  console.log('🔐 アクセストークン取得中...');
  const token = await getAccessToken(sa);
  const api   = hosting(token);
  console.log('✓ 認証成功\n');

  console.log('📦 バージョン作成中...');
  const createRes = await api(`sites/${SITE_ID}/versions`, 'POST', {
    config: { headers: [{ glob: '**', headers: { 'Cache-Control': 'no-cache' } }] }
  });
  if (createRes.status !== 200) throw new Error('バージョン作成失敗: ' + JSON.stringify(createRes.data));
  const versionName = createRes.data.name;
  console.log('✓ バージョン:', versionName, '\n');

  console.log('📁 ファイル収集中...');
  const files = collectFiles(__dirname);
  console.log(`✓ ${Object.keys(files).length} ファイル検出\n`);

  const fileHashes = {};
  const gzippedMap = {};
  for (const [webPath, localPath] of Object.entries(files)) {
    const gz   = zlib.gzipSync(fs.readFileSync(localPath));
    const hash = crypto.createHash('sha256').update(gz).digest('hex');
    fileHashes[webPath] = hash;
    gzippedMap[hash]    = gz;
  }

  console.log('📋 ファイルリスト送信中...');
  const popRes = await api(`${versionName}:populateFiles`, 'POST', { files: fileHashes });
  if (popRes.status !== 200) throw new Error('populateFiles 失敗: ' + JSON.stringify(popRes.data));

  const needed    = popRes.data.uploadRequiredHashes || [];
  const uploadUrl = popRes.data.uploadUrl;
  console.log(`✓ アップロード必要: ${needed.length} ファイル\n`);

  if (needed.length > 0) {
    console.log('⬆️  アップロード中...');
    for (let i = 0; i < needed.length; i++) {
      await uploadFile(token, uploadUrl, needed[i], gzippedMap[needed[i]]);
      process.stdout.write(`\r  ${i + 1} / ${needed.length}`);
    }
    console.log('\n✓ アップロード完了\n');
  }

  console.log('🔒 バージョン確定中...');
  const finRes = await api(`${versionName}?updateMask=status`, 'PATCH', { status: 'FINALIZED' });
  if (finRes.status !== 200) throw new Error('確定失敗: ' + JSON.stringify(finRes.data));

  console.log('🚀 リリース作成中...');
  const relRes = await api(
    `sites/${SITE_ID}/releases?versionName=${encodeURIComponent(versionName)}`,
    'POST', {}
  );
  if (relRes.status !== 200) throw new Error('リリース失敗: ' + JSON.stringify(relRes.data));

  console.log('\n🎉 デプロイ完了！');
  console.log(`🌐 https://${SITE_ID}.web.app`);
}

deploy().catch(err => {
  console.error('\n❌ エラー:', err.message);
  process.exit(1);
});
