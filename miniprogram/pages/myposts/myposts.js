// 记录版守卫：COMMUNITY 关闭时此页不可用
const __F = require('../../utils/features.js');
let __bounced = false;
function __commGuard() {
  if (__F.COMMUNITY) return false;
  if (!__bounced) {
    __bounced = true;
    wx.showToast({ title: '该功能暂未开放', icon: 'none' });
    setTimeout(function () { __bounced = false; wx.switchTab({ url: '/pages/home/home' }); }, 500);
  }
  return true;
}

const S = require('../../utils/store.js');
Page({
  data: { list: [], colA: [], colB: [], totalLikes: 0, loading: true },
  async onShow() {
    if (__commGuard()) return; await getApp().waitReady(); this.load(); },
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
