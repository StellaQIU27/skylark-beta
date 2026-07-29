// 雀跃 Skylark — 小程序入口
const CLOUD_ENV = 'cloud1-d4gwsv0jr216a116c';

App({
  globalData: {
    env: CLOUD_ENV,
    openid: null,
    user: null,       // { name, avatar }
    ready: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
    this.initUser();
  },

  // 取得 openid（云开发自带身份，不需要额外登录）
  async initUser() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' });
      this.globalData.openid = res.result.openid;
    } catch (e) {
      // 未部署云函数时，退化为本地生成的临时 id（仅开发期）
      let local = wx.getStorageSync('skylark_local_id');
      if (!local) {
        local = 'local_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        wx.setStorageSync('skylark_local_id', local);
      }
      this.globalData.openid = local;
      console.warn('云函数 login 未就绪，使用本地 id', e);
    }
    // 读取本地资料
    const u = wx.getStorageSync('skylark_user');
    this.globalData.user = u || { name: '雀跃用户', avatar: null };
    this.globalData.ready = true;
    if (this.readyCallback) this.readyCallback(this.globalData.openid);
    // 启动埋点（用于统计激活与留存）
    try {
      wx.cloud.callFunction({
        name: 'track',
        data: { name: 'app_launch', props: { sys: (wx.getSystemInfoSync() || {}).platform || '' } }
      }).catch(() => {});
    } catch (e) {}
  },

  // 页面可等待 openid 就绪
  waitReady() {
    return new Promise(resolve => {
      if (this.globalData.ready) return resolve(this.globalData.openid);
      this.readyCallback = resolve;
    });
  }
});
