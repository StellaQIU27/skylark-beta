const S = require('../../utils/store.js');
Page({
  data: { list: [] },
  async onShow() {
    await getApp().waitReady();
    const openid = getApp().globalData.openid;
    const posts = await S.fetchPosts();
    const notifs = await S.fetchNotifications();
    const list = posts.filter(p => p.author_id === openid && (p.likes || 0) > 0)
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .map(p => {
        const actors = (notifs || []).filter(n => n.type === 'like' && String(n.postId) === String(p.id)).map(n => n.actor);
        const uniq = actors.filter((v, i) => actors.indexOf(v) === i).slice(0, 3);
        return {
          id: p.id, likes: p.likes,
          disp: (p.title || p.body || '（图片动态）').slice(0, 20),
          who: uniq.length ? ' · ' + uniq.join('、') + ' 等' : ''
        };
      });
    this.setData({ list });
  },
  open(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); }
});
