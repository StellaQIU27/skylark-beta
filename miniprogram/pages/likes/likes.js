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
  data: { list: [] },
  async onShow() {
    if (__commGuard()) return;
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
