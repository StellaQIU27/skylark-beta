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
  data: { list: [], emptyT: '还没有粉丝', emptyS: '多发动态、和鸟友互动，\n粉丝会慢慢来的。' },
  async onShow() {
    if (__commGuard()) return;
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
