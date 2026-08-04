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

// 把老站的一张图（data URL 或 http 链接）转存到云存储，返回 fileID
async function movePhoto(src, tag) {
  if (typeof src !== 'string' || !src) return null;
  if (src.indexOf('cloud://') === 0) return src; // 已是云文件

  let buf, ext = 'jpg';
  if (src.indexOf('data:') === 0) {
    const m = /^data:([^;,]+)(;base64)?,/.exec(src);
    if (!m) return null;
    ext = EXT[m[1]] || 'jpg';
    buf = Buffer.from(src.slice(m[0].length), m[2] ? 'base64' : 'utf8');
  } else if (/^https?:\/\//.test(src)) {
    const r = await get(src, {});
    if (r.status !== 200) return null;
    buf = r.buf;
    const t = (src.split('?')[0].split('.').pop() || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(t) >= 0) ext = t === 'jpeg' ? 'jpg' : t;
  } else {
    return null;
  }
  if (!buf || !buf.length) return null;

  const up = await cloud.uploadFile({
    cloudPath: 'legacy/' + tag + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext,
    fileContent: buf
  });
  return up.fileID;
}

/* ---------- 主流程 ---------- */
exports.main = async event => {
  const OPENID = cloud.getWXContext().OPENID;
  if (ADMINS.indexOf(OPENID) < 0) return { ok: false, msg: '无权限' };

  const dryRun = !!event.dryRun;
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

  for (const p of src) {
    if (done[String(p.id)]) { stat.skipped++; continue; }
    try {
      const photos = [];
      for (const ph of (p.photos || [])) {
        const fid = await movePhoto(ph, 'p' + p.id);
        if (fid) { photos.push(fid); stat.photos++; }
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

  return { ok: true, stat, log };
};
