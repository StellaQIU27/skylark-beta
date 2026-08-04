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
    const raw = await S.fetchNotifications();
    const list = (raw || []).map(n => ({
      _id: n._id, postId: n.postId, read: n.read,
      actor: n.actor || '鸟友', initial: (n.actor || '友')[0],
      actText: n.type === 'like' ? '赞了你的动态' : '评论了你的动态',
      titleText: n.postTitle ? ` 《${n.postTitle}》` : '',
      commentText: n.commentText || '',
      timeText: S.fmtTime(n.createdAt)
    }));
    this.setData({ list });
    S.markNotifsRead();
  },
  openPost(e) {
    const id = e.currentTarget.dataset.pid;
    if (id) wx.navigateTo({ url: '/pages/post/post?id=' + id });
  }
});
