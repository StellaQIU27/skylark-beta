const S = require('../../utils/store.js');
const ADMINS = ['obfhL3fhV1pnZlo9QyYZwPzD2i4M'];

Page({
  data: {
    version: 'v1.0.0', isAdmin: false, blockedCount: 0,
    user: { name: '雀跃用户', avatar: null }, initial: '雀',
    showEdit: false, tmpName: '', tmpAvatar: null
  },

  async onShow() {
    await getApp().waitReady();
    const u = S.getState().user || { name: '雀跃用户', avatar: null };
    const oid = getApp().globalData.openid;
    this.setData({
      user: u, initial: (u.name || '雀')[0],
      isAdmin: ADMINS.indexOf(oid) >= 0,
      blockedCount: (typeof S.blockedList === 'function' ? S.blockedList() : []).length
    });
  },

  editProfile() {
    const u = this.data.user;
    this.setData({ showEdit: true, tmpName: u.name || '', tmpAvatar: u.avatar || null });
  },
  closeEdit() { this.setData({ showEdit: false }); },
  onName(e) { this.data.tmpName = e.detail.value; },
  pickAvatar() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中' });
        try {
          const up = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}.jpg`, filePath: res.tempFiles[0].tempFilePath
          });
          this.setData({ tmpAvatar: up.fileID });
        } catch (e) {}
        wx.hideLoading();
      }
    });
  },
  saveProfile() {
    const name = (this.data.tmpName || '').trim() || '雀跃用户';
    const st = S.getState();
    st.user = { name, avatar: this.data.tmpAvatar || null };
    S.saveState();
    this.setData({ showEdit: false, user: st.user, initial: name[0] });
    wx.showToast({ title: '资料已更新', icon: 'none' });
  },

  goRule() { wx.navigateTo({ url: '/pages/terms/terms?tab=rule' }); },
  goTerms() { wx.navigateTo({ url: '/pages/terms/terms?tab=terms' }); },
  goPrivacy() { wx.navigateTo({ url: '/pages/terms/terms?tab=privacy' }); },
  goBlocked() {
    const list = (typeof S.blockedList === 'function' ? S.blockedList() : []);
    if (!list.length) { wx.showToast({ title: '还没有拉黑任何人', icon: 'none' }); return; }
    wx.showActionSheet({
      itemList: list.map((id, i) => `解除拉黑 #${i + 1}（${id.slice(0, 8)}…）`),
      success: (res) => {
        const id = list[res.tapIndex];
        S.toggleBlock(id);
        this.setData({ blockedCount: S.blockedList().length - 0 });
        wx.showToast({ title: '已解除拉黑', icon: 'none' });
      }
    });
  },
  goNotif() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goHelp() { wx.navigateTo({ url: '/pages/help/help' }); },
  goSelfTest() { wx.navigateTo({ url: '/pages/selftest/selftest' }); },
  goDashboard() { wx.navigateTo({ url: '/pages/dashboard/dashboard' }); },
  soon() { wx.showToast({ title: '即将推出', icon: 'none' }); },

  // 只给已迁入但缺图的老帖补图片（管理员）
  async fixPhotos() {
    let rounds = 0, got = 0;
    const logs = [], errs = [];
    try {
      while (rounds++ < 30) {
        wx.showLoading({ title: '补图中 ' + got + ' 张…', mask: true });
        const res = await wx.cloud.callFunction({ name: 'migrate', data: { fixPhotos: true, max: 1 } });
        const d = res.result || {};
        if (!d.ok) { wx.hideLoading(); wx.showModal({ title: '失败', content: d.msg || '', showCancel: false }); return; }
        if (!d.needTotal) { wx.hideLoading(); wx.showModal({ title: '没有缺图的帖子', content: '所有老帖的图片都已就位。', showCancel: false }); return; }
        got += d.stat.photos;
        logs.push.apply(logs, d.log);
        errs.push.apply(errs, d.stat.errors);
        if (!d.stat.photos) break;      // 这一轮没进展，避免死循环
        if (!d.remaining) break;
      }
      wx.hideLoading();
      wx.showModal({
        title: '补图结束',
        content: '成功上传 ' + got + ' 张。\n' + logs.join('\n') + (errs.length ? '\n失败：' + errs.slice(0, 4).join('；') : ''),
        showCancel: false
      });
      console.log('fixPhotos', logs, errs);
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '中断', content: e.errMsg || e.message || '', showCancel: false });
    }
  },

  // 认领老帖：把某个老账号的帖子/评论改归到指定 openid
  async claimLegacy() {
    wx.showLoading({ title: '读取作者…', mask: true });
    let list;
    try {
      const r = await wx.cloud.callFunction({ name: 'migrate', data: { authors: true } });
      list = ((r.result || {}).authors || []).filter(a => a.id !== 'official_guide');
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '失败', content: e.errMsg || e.message || '', showCancel: false });
      return;
    }
    wx.hideLoading();
    if (!list.length) { wx.showToast({ title: '没有老账号', icon: 'none' }); return; }

    wx.showActionSheet({
      itemList: list.map(a => a.name + '（' + a.posts + '帖）').slice(0, 6),
      success: res => {
        const a = list[res.tapIndex];
        wx.showModal({
          title: '认领「' + a.name + '」的帖子',
          editable: true,
          placeholderText: '粘贴该用户的微信 openid',
          success: async m => {
            const oid = (m.content || '').trim();
            if (!m.confirm || !oid) return;
            wx.showLoading({ title: '处理中…', mask: true });
            try {
              const r = await wx.cloud.callFunction({
                name: 'migrate',
                data: { claim: { legacyAuthorId: a.id, openid: oid } }
              });
              wx.hideLoading();
              const d = r.result || {};
              wx.showModal({
                title: d.ok ? '完成' : '失败',
                content: d.ok ? d.log.join('\n') : (d.msg || ''),
                showCancel: false
              });
            } catch (e) {
              wx.hideLoading();
              wx.showModal({ title: '失败', content: e.errMsg || e.message || '', showCancel: false });
            }
          }
        });
      }
    });
  },

  // 诊断：看看老站图片字段的真实格式（不写数据）
  async probeMigrate() {
    wx.showLoading({ title: '读取中…', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'migrate', data: { probe: true } });
      wx.hideLoading();
      const rows = (res.result || {}).probe || [];
      console.log('=== 老站图片诊断 ===', JSON.stringify(rows, null, 2));
      const txt = rows.map(r => '#' + r.id + ' ' + r.title + ' → ' + r.n + '图' +
        (r.shape.length ? '\n   ' + r.shape.map(s => s.type + '/' + (s.keys || '-') + ' len' + s.len + ' ' + s.head).join('\n   ') : '')
      ).join('\n');
      wx.showModal({ title: '图片字段诊断', content: txt.slice(0, 900) || '无数据', showCancel: false });
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '失败', content: e.errMsg || e.message || '', showCancel: false });
    }
  },

  // 一次性：把网页内测版的帖子/评论迁进云数据库（管理员）
  async runMigrate() {
    wx.showLoading({ title: '正在核对…', mask: true });
    let pre;
    try {
      pre = await wx.cloud.callFunction({ name: 'migrate', data: { dryRun: true } });
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '调用失败', content: '云函数 migrate 可能还没上传。' + (e.errMsg || e.message || ''), showCancel: false });
      return;
    }
    wx.hideLoading();
    const r = pre.result || {};
    if (!r.ok) { wx.showModal({ title: '无法迁移', content: r.msg || '未知错误', showCancel: false }); return; }
    const s = r.stat;
    wx.showModal({
      title: '预览（未写入）',
      content: '待迁入 ' + s.newPosts + ' 条帖子、' + s.newComments + ' 条评论；已存在 ' + s.skipped + ' 条会跳过。\n官方护理指南已内置为置顶，不迁。\n确定开始吗？',
      confirmText: '开始迁移',
      success: async m => {
        if (!m.confirm) return;
        // 分批推进：每次云函数只处理 1 篇，避免超时
        const sum = { newPosts: 0, newComments: 0, photos: 0, skipped: 0, errors: [] };
        const logs = [];
        let guard = 0;
        try {
          while (guard++ < 100) {
            wx.showLoading({ title: '迁移中 ' + sum.newPosts + '/' + s.newPosts + '…', mask: true });
            const res = await wx.cloud.callFunction({ name: 'migrate', data: { max: 1 } });
            const d = res.result || {};
            if (!d.ok) { wx.hideLoading(); wx.showModal({ title: '失败', content: d.msg || '未知错误', showCancel: false }); return; }
            sum.newPosts += d.stat.newPosts;
            sum.newComments += d.stat.newComments;
            sum.photos += d.stat.photos;
            sum.skipped = d.stat.skipped;
            sum.errors = sum.errors.concat(d.stat.errors);
            logs.push.apply(logs, d.log);
            if (!d.remaining) break;
          }
          wx.hideLoading();
          wx.showModal({
            title: '迁移完成',
            content: '新增 ' + sum.newPosts + ' 帖 / ' + sum.newComments + ' 评论 / ' + sum.photos + ' 张图；跳过 ' + sum.skipped + ' 条。' + (sum.errors.length ? '\n失败：' + sum.errors.join('；') : ''),
            showCancel: false
          });
          console.log('migrate log', logs);
        } catch (e) {
          wx.hideLoading();
          wx.showModal({
            title: '中断',
            content: (e.errMsg || e.message || '') + '\n已迁入 ' + sum.newPosts + ' 帖。重新点一次会从断点继续。',
            showCancel: false
          });
        }
      }
    });
  },

  clearLocal() {
    wx.showModal({
      title: '清除本地数据', content: '将清除本机缓存（云端数据不受影响，可重新恢复）。确定吗？',
      success: r => {
        if (!r.confirm) return;
        try { wx.removeStorageSync('skylark_state_v1'); } catch (e) {}
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  }
});
