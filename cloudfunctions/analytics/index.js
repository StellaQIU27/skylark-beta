// 云函数：内测数据分析（仅管理员可调用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 只有这些 openid 能查看数据（管理员白名单）
const ADMINS = ['obfhL3fhV1pnZlo9QyYZwPzD2i4M'];

exports.main = async (event) => {
  const me = cloud.getWXContext().OPENID;
  if (ADMINS.length && ADMINS.indexOf(me) < 0) {
    return { error: '无权限', yourOpenid: me };
  }

  const [evRes, postRes, cmtRes, petRes] = await Promise.all([
    db.collection('events').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('posts').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('comments').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('pets').limit(1000).get().catch(() => ({ data: [] }))
  ]);
  const events = evRes.data || [];
  const posts = postRes.data || [];
  const comments = cmtRes.data || [];
  const pets = petRes.data || [];

  // ---- 用户维度 ----
  const users = {};
  const touch = (openid, day, ts) => {
    if (!openid) return;
    if (!users[openid]) users[openid] = { days: {}, first: ts, last: ts, posts: 0, comments: 0, records: 0, pets: 0 };
    const u = users[openid];
    u.days[day] = 1;
    if (ts < u.first) u.first = ts;
    if (ts > u.last) u.last = ts;
  };
  const dayOf = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  events.forEach(e => touch(e.openid, e.day || dayOf(e.ts), e.ts));
  posts.forEach(p => { touch(p._openid, dayOf(p.createdAt), p.createdAt); if (users[p._openid]) users[p._openid].posts++; });
  comments.forEach(c => { touch(c._openid, dayOf(c.createdAt), c.createdAt); if (users[c._openid]) users[c._openid].comments++; });

  // 个人记录（爱鸟档案里的 records）
  pets.forEach(doc => {
    const oid = doc._openid;
    if (!oid) return;
    if (!users[oid]) touch(oid, dayOf(doc.updatedAt || Date.now()), doc.updatedAt || Date.now());
    const u = users[oid];
    u.pets = (doc.pets || []).length;
    let n = 0;
    Object.keys(doc.records || {}).forEach(pid => { n += Object.keys(doc.records[pid] || {}).length; });
    u.records = n;
  });

  const list = Object.keys(users).map(k => {
    const u = users[k];
    return {
      openid: k.slice(0, 8) + '…',
      activeDays: Object.keys(u.days).length,
      firstDay: dayOf(u.first), lastDay: dayOf(u.last),
      spanDays: Math.round((u.last - u.first) / 86400000),
      posts: u.posts, comments: u.comments, pets: u.pets, records: u.records
    };
  }).sort((a, b) => b.activeDays - a.activeDays);

  const total = list.length || 1;
  const retained1 = list.filter(u => u.activeDays > 1).length;
  const retained7 = list.filter(u => u.spanDays >= 7).length;
  const recorders = list.filter(u => u.records > 0);

  // 事件统计
  const evCount = {};
  events.forEach(e => { evCount[e.name] = (evCount[e.name] || 0) + 1; });

  // 按天活跃
  const dau = {};
  events.forEach(e => {
    const d = e.day || dayOf(e.ts);
    if (!dau[d]) dau[d] = {};
    dau[d][e.openid] = 1;
  });
  const dauList = Object.keys(dau).sort().map(d => ({ day: d, users: Object.keys(dau[d]).length }));

  return {
    summary: {
      激活用户: list.length,
      跨天回访: `${retained1}/${list.length} (${Math.round(retained1 / total * 100)}%)`,
      七日留存: `${retained7}/${list.length} (${Math.round(retained7 / total * 100)}%)`,
      有记录行为的用户: `${recorders.length}/${list.length}`,
      人均记录条数: recorders.length ? (recorders.reduce((s, u) => s + u.records, 0) / recorders.length).toFixed(1) : 0,
      帖子总数: posts.length,
      评论总数: comments.length,
      事件总数: events.length
    },
    dau: dauList,
    events: evCount,
    users: list
  };
};
