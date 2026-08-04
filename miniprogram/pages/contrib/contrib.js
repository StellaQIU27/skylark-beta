const S = require('../../utils/store.js');
const F = require('../../utils/features.js');

const TYPE_TEXT = { photo: '换图', data: '资料纠错', idtip: '补充识别' };

Page({
  data: {
    live: F.PHOTO_CONTRIB,
    tabs: [{ k: 'pending', n: '待审' }, { k: 'accepted', n: '已采纳' }, { k: 'rejected', n: '已驳回' }],
    status: 'pending', list: [], counts: {}, loading: true
  },

  async onShow() {
    await getApp().waitReady();
    this.load();
  },

  switchTab(e) {
    this.setData({ status: e.currentTarget.dataset.k, loading: true, list: [] }, () => this.load());
  },

  async load() {
    try {
      const r = await wx.cloud.callFunction({
        name: 'contrib', data: { action: 'list', status: this.data.status }
      });
      const d = r.result || {};
      if (!d.ok) {
        this.setData({ loading: false });
        wx.showModal({ title: '读取失败', content: d.msg || '', showCancel: false });
        return;
      }
      this.setData({
        loading: false,
        counts: d.counts || {},
        list: (d.list || []).map(x => Object.assign({}, x, {
          typeText: TYPE_TEXT[x.type] || x.type,
          timeText: S.fmtTime(x.createdAt)
        }))
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showModal({
        title: '调用失败',
        content: '云函数 contrib 可能还没上传。' + (e.errMsg || ''),
        showCancel: false
      });
    }
  },

  preview(e) { wx.previewImage({ urls: [e.currentTarget.dataset.src] }); },

  accept(e) { this.act('accept', e.currentTarget.dataset.id, '采纳这条投稿？照片会替换图鉴里的用图。'); },
  reject(e) { this.act('reject', e.currentTarget.dataset.id, '驳回这条投稿？'); },
  revoke(e) { this.act('revoke', e.currentTarget.dataset.id, '恢复为待审？已上线的照片会一并撤下。'); },

  act(action, id, tip) {
    wx.showModal({
      title: '确认', content: tip,
      success: async r => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中', mask: true });
        try {
          const res = await wx.cloud.callFunction({ name: 'contrib', data: { action, id } });
          wx.hideLoading();
          if (!(res.result || {}).ok) {
            wx.showToast({ title: (res.result || {}).msg || '失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已处理', icon: 'none' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '失败', icon: 'none' });
        }
      }
    });
  }
});
