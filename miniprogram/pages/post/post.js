const S = require('../../utils/store.js');

const FIELD_LABEL = { age: '年龄', symptoms: '症状', diet: '饮食', weightChange: '体重变化', place: '地点', time: '时间', confidence: '置信度' };

Page({
  data: {
    id: null, post: null, photos: [], cur: 0,
    comments: [], initial: '', chanName: '', fieldRows: [],
    mine: false, blocked: false, bookmarked: false,
    draft: '', replyTo: null, inputFocus: false
  },

  onLoad(opt) { this.postId = opt.id; },

  async onShow() {
    await getApp().waitReady();
    this.load();
  },

  async load() {
    const posts = await S.fetchPosts();
    const p = posts.find(x => String(x.id) === String(this.postId));
    if (!p) { wx.showToast({ title: '动态不存在', icon: 'none' }); return; }

    const st = S.getState();
    const openid = getApp().globalData.openid;
    const ch = S.CHAN[S.postChannelKey(p)] || { name: '讨论' };

    // 评论：顶级 + 其下回复
    // 过滤被拉黑用户的评论
    const blockedFn = typeof S.isBlocked === 'function' ? S.isBlocked : () => false;
    const all = (p.comments || []).filter(c => !blockedFn(c.author_id));
    const tops = all.filter(c => !c.parent_id);
    const flat = [];
    tops.forEach(c => {
      flat.push(this.decorate(c, false, openid, st));
      all.filter(r => r.parent_id === c.id).forEach(r => flat.push(this.decorate(r, true, openid, st)));
    });

    const fieldRows = Object.keys(p.fields || {}).map(k => ({ k, label: FIELD_LABEL[k] || k, v: p.fields[k] }));

    this.setData({
      post: p, photos: p.photos || [], cur: 0,
      comments: flat, initial: (p.author || '友')[0],
      chanName: ch.name, fieldRows,
      mine: S.isMine(p),
      blocked: blockedFn(p.author_id),
      bookmarked: (st.bookmarks || []).some(b => String(b.id) === String(p.id))
    });
  },

  decorate(c, isReply, openid, st) {
    return Object.assign({}, c, {
      isReply,
      initial: (c.author || '友')[0],
      mine: c.author_id === openid,
      liked: (st.likedComments || []).indexOf(c.id) >= 0
    });
  },

  onSwipe(e) { this.setData({ cur: e.detail.current }); },
  previewImg(e) { wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.photos }); },

  async toggleLike() {
    const p = this.data.post;
    const willLike = !p.likedByMe;
    const likes = Math.max(0, (p.likes || 0) + (willLike ? 1 : -1));
    this.setData({ 'post.likedByMe': willLike, 'post.likes': likes });
    try {
      await S.toggleLike(p.id, willLike, likes);
      if (willLike && p.author_id && p.author_id !== getApp().globalData.openid) {
        S.addNotification({
          recipientId: p.author_id, actor: (S.getState().user || {}).name || '鸟友',
          type: 'like', postId: p.id, postTitle: p.title || ''
        });
      }
    } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }); }
  },

  toggleBookmark() {
    const st = S.getState();
    const p = this.data.post;
    if (!st.bookmarks) st.bookmarks = [];
    const has = st.bookmarks.some(b => String(b.id) === String(p.id));
    if (has) { st.bookmarks = st.bookmarks.filter(b => String(b.id) !== String(p.id)); wx.showToast({ title: '已取消收藏', icon: 'none' }); }
    else { st.bookmarks.unshift(JSON.parse(JSON.stringify(p))); wx.showToast({ title: '已收藏', icon: 'none' }); }
    S.saveState();
    this.setData({ bookmarked: !has });
  },

  sharePost() { wx.showToast({ title: '点右上角 ··· 分享', icon: 'none' }); },
  onShareAppMessage() {
    const p = this.data.post || {};
    return { title: p.title || p.body || '雀跃 · 鸟友动态', path: '/pages/post/post?id=' + p.id };
  },

  focusInput() { this.setData({ inputFocus: true }); },
  onInput(e) { this.data.draft = e.detail.value; },
  startReply(e) {
    const c = this.data.comments.find(x => x.id === e.currentTarget.dataset.id);
    this.setData({ replyTo: { id: c.id, author: c.author }, inputFocus: true });
  },
  cancelReply() { this.setData({ replyTo: null }); },

  async submitComment() {
    const text = (this.data.draft || '').trim();
    if (!text) { wx.showToast({ title: '写点什么再发送', icon: 'none' }); return; }
    const p = this.data.post;
    const parent = this.data.replyTo ? this.data.replyTo.id : null;

    // 内容安全检测
    wx.showLoading({ title: '检测中' });
    const safe = await S.checkContent(text, '', 2);
    wx.hideLoading();
    if (!safe) return;

    wx.showLoading({ title: '发送中' });
    try {
      await S.addComment(p.id, text, parent);
      S.track('comment_add', { postId: p.id, isReply: !!parent });
      if (p.author_id && p.author_id !== getApp().globalData.openid) {
        S.addNotification({
          recipientId: p.author_id, actor: (S.getState().user || {}).name || '鸟友',
          type: 'comment', postId: p.id, postTitle: p.title || '', commentText: text
        });
      }
      this.setData({ draft: '', replyTo: null });
      await this.load();
      wx.hideLoading();
      wx.showToast({ title: parent ? '回复已发布' : '评论已发布', icon: 'none' });
    } catch (e) { wx.hideLoading(); wx.showToast({ title: '发送失败', icon: 'none' }); }
  },

  async likeComment(e) {
    const id = e.currentTarget.dataset.id;
    const st = S.getState();
    if (!st.likedComments) st.likedComments = [];
    const liked = st.likedComments.indexOf(id) >= 0;
    st.likedComments = liked ? st.likedComments.filter(x => x !== id) : st.likedComments.concat(id);
    S.saveState();
    const comments = this.data.comments.map(c =>
      c.id === id ? Object.assign({}, c, { liked: !liked, likes: Math.max(0, (c.likes || 0) + (liked ? -1 : 1)) }) : c
    );
    this.setData({ comments });
    try {
      const c = comments.find(x => x.id === id);
      await wx.cloud.database().collection('comments').doc(id).update({ data: { likes: c.likes } });
    } catch (err) {}
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除评论', content: '删除这条评论吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try { await S.removeComment(id); await this.load(); wx.showToast({ title: '评论已删除', icon: 'none' }); }
        catch (err) { wx.showToast({ title: '删除失败', icon: 'none' }); }
      }
    });
  },

  editPost() { wx.navigateTo({ url: '/pages/editor/editor?mode=post&edit=' + this.data.post.id }); },
  deletePost() {
    wx.showModal({
      title: '删除动态', content: '确定删除这条动态吗？删除后无法恢复。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await S.removePost(this.data.post.id);
          wx.showToast({ title: '动态已删除', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); }
      }
    });
  },

  /* ---------- 举报 / 拉黑（UGC 合规） ---------- */
  REASONS: ['垃圾广告', '色情低俗', '辱骂攻击', '虚假信息', '动物交易', '侵权内容', '其他'],

  reportPost() { this.doReport('post', this.data.post.id); },
  reportComment(e) { this.doReport('comment', e.currentTarget.dataset.id); },
  doReport(type, targetId) {
    const reasons = this.REASONS;
    wx.showActionSheet({
      itemList: reasons,
      success: async (res) => {
        const reason = reasons[res.tapIndex];
        wx.showLoading({ title: '提交中' });
        const ok = await S.reportContent(type, targetId, reason,
          type === 'post' ? (this.data.post.title || this.data.post.body || '').slice(0, 100) : '');
        wx.hideLoading();
        wx.showModal({
          title: ok ? '举报已提交' : '提交失败',
          content: ok ? '感谢你的反馈，我们会尽快核实处理。' : '请稍后再试。',
          showCancel: false
        });
      }
    });
  },

  blockUser() {
    const uid = this.data.post.author_id;
    if (!uid) return;
    const isBlocked = S.isBlocked(uid);
    wx.showModal({
      title: isBlocked ? '取消拉黑' : '拉黑此用户',
      content: isBlocked
        ? '取消后你将重新看到 TA 的动态与评论。'
        : '拉黑后你将不再看到 TA 发布的动态与评论，可在「我的 → 设置」中取消。',
      success: (r) => {
        if (!r.confirm) return;
        const now = S.toggleBlock(uid);
        this.setData({ blocked: now });
        wx.showToast({ title: now ? '已拉黑' : '已取消拉黑', icon: 'none' });
        if (now) setTimeout(() => wx.navigateBack(), 700);
      }
    });
  },

  goUser() { this.goUserId(this.data.post.author_id); },
  goUserById(e) { this.goUserId(e.currentTarget.dataset.uid); },
  goUserId(uid) {
    if (!uid || uid === getApp().globalData.openid) { wx.switchTab({ url: '/pages/profile/profile' }); return; }
    wx.navigateTo({ url: '/pages/user/user?id=' + uid });
  }
});
