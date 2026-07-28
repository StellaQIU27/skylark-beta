Page({
  data: { version: 'v1.0.0' },
  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }); },
  goNotif() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
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
