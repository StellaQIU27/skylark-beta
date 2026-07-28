const S = require('../../utils/store.js');
Page({
  data: { list: [], emptyT: '还没有关注的人', emptyS: '在鸟友主页点「关注」，\nTA 们会出现在这里。' },
  async onShow() {
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
