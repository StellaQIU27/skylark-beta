const S = require('../../utils/store.js');
Page({
  data: { list: [], colA: [], colB: [], totalLikes: 0, loading: true },
  async onShow() { await getApp().waitReady(); this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  async load(done) {
    const openid = getApp().globalData.openid;
    const all = await S.fetchPosts();
    const list = all.filter(p => p.author_id === openid).map(p => Object.assign({}, p, {
      photoCount: (p.photos || []).length,
      commentCount: (p.comments || []).length,
      chanName: (S.CHAN[S.postChannelKey(p)] || { name: '讨论' }).name
    }));
    const colA = [], colB = [];
    list.forEach((p, i) => (i % 2 === 0 ? colA : colB).push(p));
    this.setData({
      list, colA, colB, loading: false,
      totalLikes: list.reduce((s, p) => s + (p.likes || 0), 0)
    });
    if (done) done();
  },
  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); }
});
