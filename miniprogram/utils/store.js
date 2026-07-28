/* 雀跃 — 数据层
   社区数据（帖子/评论/点赞/关注/通知/圈子）走云开发数据库
   个人数据（爱鸟/记录/收藏/草稿）本地优先 + 云端同步（openid 隔离）
*/
const app = () => getApp();
const db = () => wx.cloud.database();
const _ = () => wx.cloud.database().command;

/* ---------- 常量 ---------- */
const CHANNELS = [
  { key: 'share',   name: '爱鸟分享',     domain: 'pet' },
  { key: 'care',    name: '护理经验',     domain: 'pet' },
  { key: 'help',    name: '新手求助',     domain: 'pet' },
  { key: 'birding', name: '观鸟记录',     domain: 'wild' },
  { key: 'idhelp',  name: '鸟种识别',     domain: 'wild' },
  { key: 'birdexp', name: '观鸟经验分享', domain: 'wild' }
];
const CHAN = {};
CHANNELS.forEach(c => { CHAN[c.key] = c; });

const GROUPS = [
  { key: 'daily',    name: '养鸟日常', domain: 'pet',  members: ['share'],                        blurb: '晒娃日常、可爱瞬间，记录你和鸟宝的每一天', icon: '/images/circle-daily.png' },
  { key: 'carehelp', name: '护理问答', domain: 'pet',  members: ['care', 'help'],                 blurb: '喂养护理、新手求助，老鸟友在线答疑',       icon: '/images/circle-care.png' },
  { key: 'wild',     name: '观鸟交流', domain: 'wild', members: ['birding', 'idhelp', 'birdexp'], blurb: '野外观鸟、鸟种识别、经验交流',             icon: '/images/circle-wild.png' }
];
const GROUP = {};
GROUPS.forEach(g => { GROUP[g.key] = g; });
const GROUP_OF = {};
GROUPS.forEach(g => g.members.forEach(k => { GROUP_OF[k] = g.key; }));

const SPECIES_LIST = [
  { name: '虎皮鹦鹉',   color: '#7FA9B8', avatar: '/images/parrot-budgie.png',    short: '虎皮鹦鹉' },
  { name: '牡丹鹦鹉',   color: '#7AAA61', avatar: '/images/parrot-lovebird.png',  short: '牡丹鹦鹉' },
  { name: '玄凤鹦鹉',   color: '#D9B068', avatar: '/images/parrot-cockatiel.png', short: '玄凤鹦鹉' },
  { name: '小太阳鹦鹉', color: '#F29B5A', avatar: '/images/parrot-conure.png',    short: '小太阳' },
  { name: '和尚鹦鹉',   color: '#8FA37C', avatar: '/images/parrot-monk.png',      short: '和尚鹦鹉' }
];
const SPECIES_AVATARS = {};
const SPECIES_COLOR = {};
SPECIES_LIST.forEach(s => { SPECIES_AVATARS[s.name] = s.avatar; SPECIES_COLOR[s.name] = s.color; });
SPECIES_AVATARS['金太阳锥尾鹦鹉'] = '/images/parrot-conure.png';
SPECIES_COLOR['金太阳锥尾鹦鹉'] = '#F29B5A';

function postChannelKey(p) { return p.channel || (p.cat === 'wild' ? 'birding' : 'share'); }
function postGroup(p) { return GROUP_OF[postChannelKey(p)] || 'daily'; }
function groupPrimaryChannel(g) { return (GROUP[g] && GROUP[g].members[0]) || 'share'; }
function avatarSrc(pet) { return pet.photo || SPECIES_AVATARS[pet.species] || '/images/skylark-logo.png'; }

/* ---------- 本地存储 ---------- */
const LS = 'skylark_state_v1';
const DEFAULT_STATE = {
  pets: [], activePetId: null, records: {},
  bookmarks: [], draftList: [], likedComments: [], joinedCircles: [],
  user: { name: '雀跃用户', avatar: null },
  recordDays: 0, streakDays: 0
};
let state = null;

function getState() {
  if (state) return state;
  try {
    const raw = wx.getStorageSync(LS);
    state = raw ? Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), raw) : JSON.parse(JSON.stringify(DEFAULT_STATE));
  } catch (e) { state = JSON.parse(JSON.stringify(DEFAULT_STATE)); }
  return state;
}
function saveState() {
  try { wx.setStorageSync(LS, state); } catch (e) {}
  syncPersonalToCloud();
}

/* ---------- 个人数据云同步（换设备自动恢复） ---------- */
let syncTimer = null;
function syncPersonalToCloud() {
  const openid = app().globalData.openid;
  if (!openid) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const c = db().collection('pets');
      const { data } = await c.where({ _openid: openid }).get();
      const payload = {
        pets: state.pets, records: state.records,
        bookmarks: state.bookmarks, draftList: state.draftList,
        user: state.user, updatedAt: Date.now()
      };
      if (data && data.length) await c.doc(data[0]._id).update({ data: payload });
      else await c.add({ data: payload });
    } catch (e) { console.warn('个人数据同步失败', e); }
  }, 1500);
}
async function restorePersonalFromCloud() {
  const openid = app().globalData.openid;
  if (!openid) return false;
  try {
    const { data } = await db().collection('pets').where({ _openid: openid }).get();
    if (data && data.length) {
      const d = data[0];
      const s = getState();
      // 本地为空时才用云端覆盖，避免误删新数据
      if (!s.pets.length && d.pets && d.pets.length) {
        s.pets = d.pets; s.records = d.records || {};
        s.bookmarks = d.bookmarks || []; s.draftList = d.draftList || [];
        if (d.user) s.user = d.user;
        s.activePetId = s.pets[0] ? s.pets[0].id : null;
        wx.setStorageSync(LS, s);
        return true;
      }
    }
  } catch (e) { console.warn('云端恢复失败', e); }
  return false;
}

/* ---------- 社区：帖子 ---------- */
async function fetchPosts(limit = 40) {
  const openid = app().globalData.openid;
  try {
    const [postRes, likeRes, cmtRes] = await Promise.all([
      db().collection('posts').orderBy('createdAt', 'desc').limit(limit).get(),
      db().collection('post_likes').where({ _openid: openid }).get(),
      db().collection('comments').orderBy('createdAt', 'asc').limit(500).get()
    ]);
    const likedSet = {};
    (likeRes.data || []).forEach(l => { likedSet[l.postId] = true; });
    const cmtBy = {};
    (cmtRes.data || []).forEach(c => {
      (cmtBy[c.postId] = cmtBy[c.postId] || []).push({
        id: c._id, author: c.author, author_id: c._openid, text: c.text,
        time: fmtTime(c.createdAt), likes: c.likes || 0, parent_id: c.parentId || null
      });
    });
    return (postRes.data || []).map(p => ({
      id: p._id, channel: p.channel, domain: p.domain,
      title: p.title || '', body: p.body || '',
      photos: p.photos || [], photo: (p.photos && p.photos[0]) || null,
      species: p.species || null, speciesName: p.speciesName || '',
      fields: p.fields || {}, author: p.author || '鸟友', author_id: p._openid,
      time: fmtTime(p.createdAt), likes: p.likes || 0,
      likedByMe: !!likedSet[p._id], comments: cmtBy[p._id] || []
    }));
  } catch (e) { console.warn('拉取帖子失败', e); return []; }
}

async function addPost(data) {
  return db().collection('posts').add({
    data: {
      channel: data.channel, domain: data.domain,
      title: data.title || '', body: data.body || '',
      photos: data.photos || [],
      species: data.species || null, speciesName: data.speciesName || '',
      fields: data.fields || {},
      author: (getState().user || {}).name || '雀跃用户',
      likes: 0, createdAt: Date.now()
    }
  });
}
async function updatePost(id, data) {
  return db().collection('posts').doc(id).update({ data });
}
async function removePost(id) {
  await db().collection('posts').doc(id).remove();
  try { await db().collection('comments').where({ postId: id }).remove(); } catch (e) {}
}

/* ---------- 社区：点赞 / 评论 ---------- */
async function toggleLike(postId, willLike, newCount) {
  const openid = app().globalData.openid;
  const c = db().collection('post_likes');
  if (willLike) await c.add({ data: { postId, createdAt: Date.now() } });
  else {
    const { data } = await c.where({ postId, _openid: openid }).get();
    if (data && data[0]) await c.doc(data[0]._id).remove();
  }
  await db().collection('posts').doc(postId).update({ data: { likes: newCount } });
}
async function addComment(postId, text, parentId) {
  return db().collection('comments').add({
    data: {
      postId, text, parentId: parentId || null,
      author: (getState().user || {}).name || '雀跃用户',
      likes: 0, createdAt: Date.now()
    }
  });
}
async function removeComment(id) {
  await db().collection('comments').doc(id).remove();
  try { await db().collection('comments').where({ parentId: id }).remove(); } catch (e) {}
}

/* ---------- 圈子成员 ---------- */
async function fetchCircleCounts() {
  const counts = {};
  try {
    for (const g of GROUPS) {
      const res = await db().collection('circle_members').where({ circleKey: g.key }).count();
      counts[g.key] = res.total || 0;
    }
  } catch (e) { console.warn('圈子人数失败', e); }
  return counts;
}
async function joinCircle(key, joining) {
  const openid = app().globalData.openid;
  const c = db().collection('circle_members');
  if (joining) await c.add({ data: { circleKey: key, createdAt: Date.now() } });
  else {
    const { data } = await c.where({ circleKey: key, _openid: openid }).get();
    if (data && data[0]) await c.doc(data[0]._id).remove();
  }
}

/* ---------- 关注 / 通知 ---------- */
async function fetchFollows() {
  const openid = app().globalData.openid;
  try {
    const [mine, fans] = await Promise.all([
      db().collection('follows').where({ _openid: openid }).get(),
      db().collection('follows').where({ followingId: openid }).get()
    ]);
    return { following: mine.data || [], followers: fans.data || [] };
  } catch (e) { return { following: [], followers: [] }; }
}
async function toggleFollow(targetId, targetName, following) {
  const openid = app().globalData.openid;
  const c = db().collection('follows');
  if (following) {
    const { data } = await c.where({ _openid: openid, followingId: targetId }).get();
    if (data && data[0]) await c.doc(data[0]._id).remove();
  } else {
    await c.add({ data: { followingId: targetId, followingName: targetName, createdAt: Date.now() } });
  }
}
async function fetchNotifications() {
  const openid = app().globalData.openid;
  try {
    const { data } = await db().collection('notifications')
      .where({ recipientId: openid }).orderBy('createdAt', 'desc').limit(50).get();
    return data || [];
  } catch (e) { return []; }
}
async function addNotification(n) {
  try { await db().collection('notifications').add({ data: Object.assign({ createdAt: Date.now(), read: false }, n) }); } catch (e) {}
}
async function markNotifsRead() {
  const openid = app().globalData.openid;
  try {
    const { data } = await db().collection('notifications').where({ recipientId: openid, read: false }).get();
    for (const n of (data || [])) await db().collection('notifications').doc(n._id).update({ data: { read: true } });
  } catch (e) {}
}

/* ---------- 工具 ---------- */
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isMine(p) { return p.author_id && p.author_id === app().globalData.openid; }

module.exports = {
  CHANNELS, CHAN, GROUPS, GROUP, GROUP_OF, SPECIES_LIST, SPECIES_AVATARS, SPECIES_COLOR,
  postChannelKey, postGroup, groupPrimaryChannel, avatarSrc,
  getState, saveState, restorePersonalFromCloud,
  fetchPosts, addPost, updatePost, removePost,
  toggleLike, addComment, removeComment,
  fetchCircleCounts, joinCircle,
  fetchFollows, toggleFollow,
  fetchNotifications, addNotification, markNotifsRead,
  fmtTime, todayISO, isMine
};
