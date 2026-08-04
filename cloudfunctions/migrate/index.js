// 云函数：migrate —— 一次性把网页内测版（Supabase）的社区帖子/评论迁入云开发数据库
// 仅管理员可调用；带 legacyId 去重，可重复执行不会产生重复数据。
const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ADMINS = ['obfhL3fhV1pnZlo9QyYZwPzD2i4M'];

const SB_URL = 'https://wxqgionqtzdjwwidkmzo.supabase.co/rest/v1';
const SB_KEY = 'sb_publishable_VKZG5L8_7AIoB-JucuULUw_CZ9uMTT4';

// 老站作者 -> 小程序 openid 的映射（认领后即可编辑/删除自己的老帖）
const OPENID_MAP = {
  dev_qh0jf4kovqjmpsediwu: 'obfhL3fhV1pnZlo9QyYZwPzD2i4M' // Stella
};

/* ---------- 工具 ---------- */
function get(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: headers || {} },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function sb(path) {
  const r = await get(SB_URL + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'apikey=' + SB_KEY, {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json'
  });
  if (r.status !== 200) throw new Error('Supabase ' + r.status + ': ' + r.buf.toString().slice(0, 200));
  return JSON.parse(r.buf.toString());
}

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// 老站一条 photo 记录可能是字符串，也可能是 {url}/{src}/{data} 这样的对象
function photoStr(x) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return x.url || x.src || x.data || x.dataUrl || x.base64 || x.path || '';
  }
  return '';
}

// 把老站的一张图转存到云存储，返回 { fileID } 或 { err }
async function movePhoto(raw, tag) {
  const src = photoStr(raw);
  if (!src) return { err: 'empty/' + (typeof raw) };
  if (src.indexOf('cloud://') === 0) return { fileID: src };

  let buf, ext = 'jpg';
  try {
    if (src.indexOf('data:') === 0) {
      const m = /^data:([^;,]*)(;base64)?,/.exec(src);
      if (!m) return { err: 'bad dataurl' };
      ext = EXT[m[1]] || 'jpg';
      buf = Buffer.from(src.slice(m[0].length), m[2] ? 'base64' : 'utf8');
    } else if (/^https?:\/\//.test(src)) {
      const r = await get(src, {});
      if (r.status !== 200) return { err: 'http ' + r.status };
      buf = r.buf;
      const t = (src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(t) >= 0) ext = t === 'jpeg' ? 'jpg' : t;
    } else if (/^[A-Za-z0-9+/=\s]{200,}$/.test(src)) {
      // 裸 base64（没有 data: 前缀）
      buf = Buffer.from(src.replace(/\s/g, ''), 'base64');
    } else {
      return { err: 'unknown scheme: ' + src.slice(0, 30) };
    }
    if (!buf || !buf.length) return { err: 'empty buffer' };

    const up = await cloud.uploadFile({
      cloudPath: 'legacy/' + tag + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext,
      fileContent: buf
    });
    return { fileID: up.fileID };
  } catch (e) {
    return { err: (e.message || String(e)).slice(0, 120) };
  }
}

/* ---------- 主流程 ---------- */
exports.main = async event => {
  const OPENID = cloud.getWXContext().OPENID;
  if (ADMINS.indexOf(OPENID) < 0) return { ok: false, msg: '无权限' };

  const dryRun = !!event.dryRun;
  const max = event.max || 1;   // 每次调用最多处理几篇（分批，避免云函数超时）
  const log = [];

  let posts, comments;
  try {
    posts = await sb('/posts?select=*&order=created_at.asc');
    comments = await sb('/comments?select=*&order=created_at.asc');
  } catch (e) {
    return { ok: false, msg: '读取老站数据失败：' + e.message };
  }

  // 官方护理指南已在小程序内置为置顶精华，不重复迁入
  const src = posts.filter(p => p.author_id !== 'official_guide');

  // 已迁过的
  const done = {};
  try {
    const ex = await db.collection('posts').where({ legacySource: 'web' }).limit(200).get();
    (ex.data || []).forEach(d => { done[String(d.legacyId)] = d._id; });
  } catch (e) {}

  const stat = { posts: src.length, skipped: 0, newPosts: 0, newComments: 0, photos: 0, errors: [] };

  // --- 诊断：看看老站的 photos 字段到底长什么样（不写入任何数据） ---
  if (event.probe) {
    return {
      ok: true, probe: src.map(p => ({
        id: p.id,
        title: (p.title || p.body || '').slice(0, 12),
        n: (p.photos || []).length,
        shape: (p.photos || []).map(x => {
          const s = photoStr(x);
          return { type: typeof x, keys: (x && typeof x === 'object') ? Object.keys(x).join(',') : '', len: s.length, head: s.slice(0, 44) };
        })
      }))
    };
  }

  // --- 认领：把某个老账号（legacyAuthorId 或老昵称）的帖子/评论改归到指定 openid ---
  if (event.claim) {
    const { legacyAuthorId, legacyName, openid } = event.claim;
    if (!openid) return { ok: false, msg: '缺少 openid' };
    const cond = legacyAuthorId ? { legacyAuthorId } : null;
    const out = [];
    let np = 0, nc = 0;

    // 帖子
    const { data: ps } = await db.collection('posts')
      .where(cond || { legacySource: 'web' }).limit(200).get();
    for (const d of (ps || [])) {
      if (!cond && d.author !== legacyName) continue;
      await db.collection('posts').doc(d._id).update({ data: { _openid: openid } });
      np++;
    }

    // 评论：按老站数据找出该作者的评论 legacyId
    const ids = comments
      .filter(c => legacyAuthorId ? c.author_id === legacyAuthorId : c.author === legacyName)
      .map(c => c.id);
    if (ids.length) {
      const { data: cs } = await db.collection('comments')
        .where({ legacySource: 'web', legacyId: db.command.in(ids) }).limit(200).get();
      for (const d of (cs || [])) {
        await db.collection('comments').doc(d._id).update({ data: { _openid: openid } });
        nc++;
      }
    }
    out.push('认领 ' + np + ' 帖 / ' + nc + ' 评论 → ' + openid.slice(0, 10) + '…');
    return { ok: true, claim: true, stat: { newPosts: np, newComments: nc, photos: 0, skipped: 0, errors: [] }, log: out };
  }

  // --- 名单：列出老站作者，方便挑谁来认领 ---
  if (event.authors) {
    const m = {};
    src.forEach(p => {
      const k = p.author_id || 'unknown';
      m[k] = m[k] || { id: k, name: p.author, posts: 0 };
      m[k].posts++;
    });
    return { ok: true, authors: Object.keys(m).map(k => m[k]) };
  }

  // --- 补图：只给已迁入但没图的帖子重新上传图片，不重建帖子 ---
  if (event.fixPhotos) {
    const fixed = [];
    const { data: exist } = await db.collection('posts').where({ legacySource: 'web' }).limit(200).get();
    const need = [];
    (exist || []).forEach(doc => {
      const old = src.find(x => String(x.id) === String(doc.legacyId));
      if (!old) return;
      const want = (old.photos || []).length;
      if (want && (doc.photos || []).length < want) need.push({ doc, old, want });
    });
    for (const item of need.slice(0, max)) {
      const photos = [];
      for (const ph of item.old.photos) {
        const r = await movePhoto(ph, 'p' + item.old.id);
        if (r.fileID) { photos.push(r.fileID); stat.photos++; }
        else stat.errors.push('#' + item.old.id + ' 图: ' + r.err);
      }
      if (photos.length) {
        await db.collection('posts').doc(item.doc._id).update({ data: { photos } });
        fixed.push('#' + item.old.id + ' 补入 ' + photos.length + '/' + item.want + ' 张');
      } else {
        fixed.push('#' + item.old.id + ' 仍失败');
      }
    }
    return { ok: true, fixPhotos: true, stat, log: fixed, remaining: Math.max(0, need.length - Math.min(max, need.length)), needTotal: need.length };
  }

  if (dryRun) {
    src.forEach(p => {
      const c = comments.filter(x => x.post_id === p.id).length;
      const n = (p.photos || []).length;
      log.push((done[String(p.id)] ? '已存在  ' : '待迁入  ') + '#' + p.id + ' 「' + (p.title || p.body || '(无标题)').slice(0, 14) + '」 ' + n + '图 ' + c + '评论 · ' + p.author);
      if (done[String(p.id)]) stat.skipped++;
    });
    stat.newPosts = src.length - stat.skipped;
    stat.newComments = comments.filter(c => {
      const p = src.find(x => x.id === c.post_id);
      return p && !done[String(p.id)];
    }).length;
    return { ok: true, dryRun: true, stat, log };
  }

  const todo = src.filter(p => !done[String(p.id)]);
  stat.skipped = src.length - todo.length;
  const batch = todo.slice(0, max);

  for (const p of batch) {
    try {
      const photos = [];
      for (const ph of (p.photos || [])) {
        const r = await movePhoto(ph, 'p' + p.id);
        if (r.fileID) { photos.push(r.fileID); stat.photos++; }
        else stat.errors.push('#' + p.id + ' 图: ' + r.err);
      }
      const owner = OPENID_MAP[p.author_id] || ('legacy_' + (p.author_id || 'unknown'));
      const add = await db.collection('posts').add({
        data: {
          _openid: owner,
          channel: p.channel || 'share',
          domain: p.domain || 'pet',
          title: p.title || '',
          body: p.body || '',
          photos,
          species: p.species || null,
          speciesName: p.species_name || '',
          fields: p.fields || {},
          author: p.author || '鸟友',
          likes: p.likes || 0,
          createdAt: new Date(p.created_at).getTime(),
          legacySource: 'web',
          legacyId: p.id,
          legacyAuthorId: p.author_id || ''
        }
      });
      stat.newPosts++;
      const newId = add._id;

      // 评论（含二级回复：先建父级再建子级，重映射 parentId）
      const mine = comments.filter(c => c.post_id === p.id);
      const idMap = {};
      const ordered = mine.filter(c => !c.parent_id).concat(mine.filter(c => c.parent_id));
      for (const c of ordered) {
        const r = await db.collection('comments').add({
          data: {
            _openid: OPENID_MAP[c.author_id] || ('legacy_' + (c.author_id || 'unknown')),
            postId: newId,
            text: c.text || '',
            parentId: c.parent_id ? (idMap[c.parent_id] || null) : null,
            author: c.author || '鸟友',
            likes: c.likes || 0,
            createdAt: new Date(c.created_at).getTime(),
            legacySource: 'web',
            legacyId: c.id
          }
        });
        idMap[c.id] = r._id;
        stat.newComments++;
      }
      log.push('✓ #' + p.id + ' 「' + (p.title || p.body || '(无标题)').slice(0, 12) + '」 ' + photos.length + '图 ' + ordered.length + '评论');
    } catch (e) {
      stat.errors.push('#' + p.id + ' ' + e.message);
      log.push('✗ #' + p.id + ' ' + e.message);
    }
  }

  // 还剩多少篇没迁 —— 前端据此循环调用
  const remaining = Math.max(0, todo.length - batch.length);
  return { ok: true, stat, log, remaining, total: src.length, migrated: src.length - remaining };
};
