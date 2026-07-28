const S = require('../../utils/store.js');
Page({
  data: { list: [], emptyT: '还没有粉丝', emptyS: '多发动态、和鸟友互动，\n粉丝会慢慢来的。' },
  async onShow() {
    await getApp().waitReady();
    const f = await S.fetchFollows();
    const mine = (f.following || []).map(x => x.followingId);
    const posts = await S.fetchPosts();
    const nameOf = {};
    posts.forEach(p => { if (p.author_id) nameOf[p.author_id] = p.author; });
    const list = (f.followers || []).map(x => {
      const n = nameOf[x._openid] || '鸟友';
      return { id: x._openid, name: n, initial: n[0], tag: mine.indexOf(x._openid) >= 0 ? '已回关' : '' };
    });
    this.setData({ list });
  },
  open(e) { wx.navigateTo({ url: '/pages/user/user?id=' + e.currentTarget.dataset.id }); }
});
