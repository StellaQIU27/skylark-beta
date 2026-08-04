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
  onShow() {
    if (__commGuard()) return; this.setData({ list: S.getState().bookmarks || [] }); },
  open(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); }
});
