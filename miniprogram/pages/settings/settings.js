const S = require('../../utils/store.js');

Page({
  data: {
    version: 'v1.0.0',
    user: { name: '雀跃用户', avatar: null }, initial: '雀',
    showEdit: false, tmpName: '', tmpAvatar: null
  },

  async onShow() {
    await getApp().waitReady();
    const u = S.getState().user || { name: '雀跃用户', avatar: null };
    this.setData({ user: u, initial: (u.name || '雀')[0] });
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

  goNotif() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goHelp() { wx.navigateTo({ url: '/pages/help/help' }); },
  soon() { wx.showToast({ title: '即将推出', icon: 'none' }); },
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
