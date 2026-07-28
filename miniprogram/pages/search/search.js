const S = require('../../utils/store.js');
const GUIDE = require('../../utils/birds.js');
Page({
  data: { q: '', birds: [], posts: [], users: [] },
  async onShow() { await getApp().waitReady(); this.all = await S.fetchPosts(); },
  onInput(e) {
    const q = (e.detail.value || '').trim().toLowerCase();
    this.setData({ q });
    if (!q) { this.setData({ birds: [], posts: [], users: [] }); return; }
    const inc = s => (s || '').toLowerCase().indexOf(q) >= 0;
    const birds = (GUIDE.BIRDS || []).filter(b =>
      inc(b.name_cn) || inc(b.scientific_name) || inc(b.family_cn) || inc(b.name_en)).slice(0, 8);
    const posts = (this.all || []).filter(p => inc(p.title) || inc(p.body)).slice(0, 12)
      .map(p => ({ id: p.id, disp: p.title || p.body || '（图片动态）', author: p.author, likes: p.likes || 0, cc: (p.comments || []).length }));
    const um = {};
    (this.all || []).forEach(p => { if (p.author_id) um[p.author_id] = p.author; });
    const users = Object.keys(um).filter(id => inc(um[id]))
      .map(id => ({ id, name: um[id], initial: (um[id] || '友')[0] })).slice(0, 8);
    this.setData({ birds, posts, users });
  },
  openBird(e) { wx.navigateTo({ url: '/pages/guide/guide?id=' + e.currentTarget.dataset.id }); },
  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); },
  openUser(e) { wx.navigateTo({ url: '/pages/user/user?id=' + e.currentTarget.dataset.id }); }
});
