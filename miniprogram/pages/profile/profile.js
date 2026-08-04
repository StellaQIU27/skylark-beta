const S = require('../../utils/store.js');
const F = require('../../utils/features.js');
const GUIDE = require('../../utils/birds.js');
const VERSION = 'v1.0.0';

Page({
  data: {
    comm: F.COMMUNITY,
    user: { name: '雀跃用户', avatar: null }, initial: '雀',
    petCount: 0, albumCount: 0, likesCount: 0, followingCount: 0, followers: 0, myPostCount: 0,
    recordDays: 0, birdCount: (GUIDE.BIRDS || []).length,
    streak: 0, dots: [], unread: 0, version: VERSION,
    showEdit: false, tmpName: '', tmpAvatar: null,
    showBackup: false, showPaste: false, pasteText: ''
  },

  async onShow() {
    await getApp().waitReady();
    await S.restorePersonalFromCloud();
    this.render();
  },

  async render() {
    const st = S.getState();
    const user = st.user || { name: '雀跃用户', avatar: null };

    let album = 0;
    Object.keys(st.records || {}).forEach(pid => {
      Object.keys(st.records[pid] || {}).forEach(d => {
        album += ((st.records[pid][d] || {}).photos || []).length;
      });
    });

    const streak = this.calcStreak(st);

    // 记录过的不重复天数
    const daySet = {};
    Object.keys(st.records || {}).forEach(pid => {
      Object.keys(st.records[pid] || {}).forEach(d => { daySet[d] = 1; });
    });

    this.setData({
      user, initial: (user.name || '雀')[0],
      petCount: (st.pets || []).length,
      albumCount: album, streak,
      recordDays: Object.keys(daySet).length,
      dots: Array(Math.min(10, streak)).fill(1)
    });

    if (!F.COMMUNITY) return;

    const [posts, follows, notifs] = await Promise.all([
      S.fetchPosts(), S.fetchFollows(), S.fetchNotifications()
    ]);
    const openid = getApp().globalData.openid;
    const myPosts = posts.filter(p => p.author_id === openid);
    const myLikes = myPosts.reduce((s, p) => s + (p.likes || 0), 0);
    this.setData({
      likesCount: myLikes,
      myPostCount: myPosts.length,
      followingCount: (follows.following || []).length,
      followers: (follows.followers || []).length,
      unread: (notifs || []).filter(n => !n.read).length
    });
  },

  calcStreak(st) {
    const pid = st.activePetId || ((st.pets || [])[0] || {}).id;
    if (!pid) return 0;
    const recs = st.records[pid] || {};
    let n = 0;
    const d = new Date();
    for (;;) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (recs[iso]) { n++; d.setDate(d.getDate() - 1); } else break;
      if (n > 400) break;
    }
    return n;
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
  async saveProfile() {
    const name = (this.data.tmpName || '').trim() || '雀跃用户';
    // 昵称内容检测
    if (name !== '雀跃用户') {
      wx.showLoading({ title: '检测中' });
      const safe = await S.checkContent(name, '', 1);
      wx.hideLoading();
      if (!safe) return;
    }
    const st = S.getState();
    st.user = { name, avatar: this.data.tmpAvatar || null };
    S.saveState();
    this.setData({ showEdit: false, user: st.user, initial: name[0] });
    wx.showToast({ title: '资料已更新', icon: 'none' });
  },

  openBackup() { this.setData({ showBackup: true }); },
  closeBackup() { this.setData({ showBackup: false }); },
  syncNow() {
    S.saveState();
    wx.showToast({ title: '已同步到云端', icon: 'none' });
    this.setData({ showBackup: false });
  },
  async restoreNow() {
    wx.showLoading({ title: '恢复中' });
    const ok = await S.restorePersonalFromCloud();
    wx.hideLoading();
    this.setData({ showBackup: false });
    wx.showToast({ title: ok ? '已从云端恢复' : '本地已是最新', icon: 'none' });
    this.render();
  },

  /* ---------- 旧版网页备份导入 ---------- */
  importFromFile() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['json'],
      success: (res) => {
        const f = res.tempFiles[0];
        wx.getFileSystemManager().readFile({
          filePath: f.path, encoding: 'utf8',
          success: (r) => this.applyBackup(r.data),
          fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' })
        });
      },
      fail: () => {}
    });
  },
  openPasteImport() { this.setData({ showBackup: false, showPaste: true, pasteText: '' }); },
  closePaste() { this.setData({ showPaste: false }); },
  onPaste(e) { this.data.pasteText = e.detail.value; },
  doPasteImport() {
    const t = (this.data.pasteText || '').trim();
    if (!t) { wx.showToast({ title: '请先粘贴内容', icon: 'none' }); return; }
    this.applyBackup(t);
  },

  applyBackup(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { wx.showToast({ title: '内容不是有效的备份', icon: 'none' }); return; }
    if (!data || typeof data !== 'object' || !data.pets) {
      wx.showToast({ title: '这不是雀跃备份文件', icon: 'none' }); return;
    }
    const petN = (data.pets || []).length;
    let recN = 0;
    Object.keys(data.records || {}).forEach(k => { recN += Object.keys(data.records[k] || {}).length; });

    wx.showModal({
      title: '导入备份',
      content: `将导入 ${petN} 只爱鸟、${recN} 条记录，并覆盖当前数据。确定吗？`,
      success: (r) => {
        if (!r.confirm) return;
        const st = S.getState();
        st.pets = (data.pets || []).map(p => {
          // 兼容旧版：确保记录页需要的字段齐全
          if (!p.color) p.color = S.SPECIES_COLOR[p.species] || '#8BA88B';
          if (!p.initial) p.initial = (p.name || '鸟')[0];
          return p;
        });
        st.records = data.records || {};
        // 兼容旧版记录里的 foods 字段（早期版本用 foods，后改为 feedings）
        Object.keys(st.records).forEach(pid => {
          Object.keys(st.records[pid] || {}).forEach(d => {
            const r = st.records[pid][d] || {};
            if (!r.feedings) r.feedings = [];
            if (!r.photos) r.photos = [];
            if (r.foods && r.foods.length && !r.feedings.length) {
              r.feedings = [{ id: Date.now(), time: '08:00', foods: r.foods }];
            }
            delete r.foods;
            delete r.updatedFields;
          });
        });
        st.bookmarks = data.bookmarks || [];
        st.draftList = data.draftList || [];
        st.likedComments = data.likedComments || [];
        st.joinedCircles = data.joinedCircles || [];
        st.recordDays = data.recordDays || 0;
        st.streakDays = data.streakDays || 0;
        if (data.user && data.user.name) {
          // 旧版头像是 base64，可直接沿用
          st.user = { name: data.user.name, avatar: data.user.avatar || null };
        }
        st.activePetId = null;   // 进入后先显示爱鸟列表
        S.saveState();
        this.setData({ showPaste: false, showBackup: false });
        wx.showToast({ title: '导入成功', icon: 'success' });
        this.render();
      }
    });
  },

  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goRecords() { wx.switchTab({ url: '/pages/records/records' }); },
  goAlbum() { wx.navigateTo({ url: '/pages/album/album' }); },
  goLikes() { wx.navigateTo({ url: '/pages/likes/likes' }); },
  goFollowing() { wx.navigateTo({ url: '/pages/following/following' }); },
  goFollowers() { wx.navigateTo({ url: '/pages/followers/followers' }); },
  goFavorites() { wx.navigateTo({ url: '/pages/favorites/favorites' }); },
  goDrafts() { wx.navigateTo({ url: '/pages/drafts/drafts' }); },
  goMyPosts() { wx.navigateTo({ url: '/pages/myposts/myposts' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  goHelp() { wx.navigateTo({ url: '/pages/help/help' }); },
  soon() { wx.showToast({ title: '即将推出', icon: 'none' }); },
  about() { wx.showToast({ title: 'Skylark · 雀跃 ' + VERSION, icon: 'none' }); }
});
