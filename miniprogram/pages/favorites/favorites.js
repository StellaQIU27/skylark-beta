const S = require('../../utils/store.js');
Page({
  data: { list: [] },
  onShow() { this.setData({ list: S.getState().bookmarks || [] }); },
  open(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); }
});
