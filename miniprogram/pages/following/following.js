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
  data: { list: [], emptyT: '还没有关注的人', emptyS: '在鸟友主页点「关注」，\nTA 们会出现在这里。' },
  async onShow() {
    if (__commGuard()) return;
    await getApp().waitReady();
    const f = await S.fetchFollows();
    const list = (f.following || []).map(x => ({
      id: x.followingId, name: x.followingName || '鸟友',
      initial: (x.followingName || '友')[0], tag: '已关注'
    }));
    this.setData({ list });
  },
  open(e) { wx.navigateTo({ url: '/pages/user/user?id=' + e.currentTarget.dataset.id }); }
});
