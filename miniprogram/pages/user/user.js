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
  data: { uid: '', name: '鸟友', initial: '友', posts: [], colA: [], colB: [], totalLikes: 0, following: false },
  onLoad(opt) {
    if (__commGuard()) return; this.uid = opt.id; },
  async onShow() {
    if (__commGuard()) return;
    await getApp().waitReady();
    const all = await S.fetchPosts();
    const posts = all.filter(p => p.author_id === this.uid);
    const name = (posts[0] && posts[0].author) || '鸟友';
    const follows = await S.fetchFollows();
    const colA = [], colB = [];
    posts.forEach((p, i) => (i % 2 === 0 ? colA : colB).push(p));
    wx.setNavigationBarTitle({ title: name });
    this.setData({
      uid: this.uid, name, initial: name[0], posts, colA, colB,
      totalLikes: posts.reduce((s, p) => s + (p.likes || 0), 0),
      following: (follows.following || []).some(f => f.followingId === this.uid)
    });
  },
  async toggleFollow() {
    const now = this.data.following;
    this.setData({ following: !now });
    try { await S.toggleFollow(this.uid, this.data.name, now); wx.showToast({ title: now ? '已取消关注' : '已关注', icon: 'none' }); }
    catch (e) { this.setData({ following: now }); wx.showToast({ title: '操作失败', icon: 'none' }); }
  },
  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); }
});
