const G = require('../../utils/birds.js');
const S = require('../../utils/store.js');
const F = require('../../utils/features.js');

const TYPES = [
  { key: 'photo', name: '换张更准的图', hint: '上传一张这种鸟的清晰照片，最好是你自己拍的' },
  { key: 'data',  name: '资料写错了',   hint: '比如学名、科属、体长、留鸟或候鸟有误，写清楚哪里不对' },
  { key: 'idtip', name: '补充识别要点', hint: '和相似鸟种怎么区分、叫声或行为特征等' }
];

Page({
  data: {
    q: '', list: [], detail: null,
    photoUrl: '', contributor: '',
    types: TYPES, showContrib: false,
    cType: 'photo', cHint: TYPES[0].hint,
    cPhoto: '', cText: '', cPlace: '', cShotAt: '',
    submitting: false
  },

  onLoad(opt) {
    this.setData({ list: G.BIRDS });
    if (opt.id) this.openId(opt.id);
  },

  onSearch(e) {
    const q = (e.detail.value || '').trim().toLowerCase();
    const inc = s => (s || '').toLowerCase().indexOf(q) >= 0;
    this.setData({
      q,
      list: q ? G.BIRDS.filter(b => inc(b.name_cn) || inc(b.scientific_name) || inc(b.family_cn) || inc(b.name_en)) : G.BIRDS
    });
  },

  open(e) { this.openId(e.currentTarget.dataset.id); },

  openId(id) {
    const d = G.BIRDS.find(b => b.id === id);
    if (!d) return;
    this.setData({ detail: d, photoUrl: '', contributor: '' });
    wx.setNavigationBarTitle({ title: d.name_cn });
    this.loadContribPhoto(id);
  },

  // 读取被采纳的鸟友照片；开关关闭时不读，图鉴仍用内置图
  async loadContribPhoto(id) {
    if (!F.PHOTO_CONTRIB) return;
    try {
      const { data } = await wx.cloud.database().collection('bird_photos')
        .where({ birdId: id }).orderBy('createdAt', 'desc').limit(1).get();
      const p = (data || [])[0];
      if (p && p.fileID && this.data.detail && this.data.detail.id === id) {
        this.setData({ photoUrl: p.fileID, contributor: p.contributor || '鸟友' });
      }
    } catch (e) { /* 集合未建时忽略 */ }
  },

  back() {
    this.setData({ detail: null, photoUrl: '', contributor: '' });
    wx.setNavigationBarTitle({ title: '鸟种图鉴' });
  },

  previewImg() {
    const src = this.data.photoUrl || (this.data.detail || {}).cc_image;
    if (src) wx.previewImage({ urls: [src] });
  },

  /* ---------- 纠错投稿 ---------- */
  openContrib() {
    this.setData({
      showContrib: true, cType: 'photo', cHint: TYPES[0].hint,
      cPhoto: '', cText: '', cPlace: '', cShotAt: ''
    });
  },
  closeContrib() { this.setData({ showContrib: false }); },

  pickType(e) {
    const k = e.currentTarget.dataset.k;
    const t = TYPES.find(x => x.key === k) || TYPES[0];
    this.setData({ cType: k, cHint: t.hint });
  },

  onCText(e) { this.setData({ cText: e.detail.value }); },
  onCPlace(e) { this.setData({ cPlace: e.detail.value }); },
  pickShotAt(e) { this.setData({ cShotAt: e.detail.value }); },

  chooseCPhoto() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: async res => {
        const f = res.tempFiles[0];
        if (!f) return;
        wx.showLoading({ title: '上传中', mask: true });
        try {
          const up = await wx.cloud.uploadFile({
            cloudPath: 'contrib/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg',
            filePath: f.tempFilePath
          });
          wx.hideLoading();
          this.setData({ cPhoto: up.fileID });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      }
    });
  },
  removeCPhoto() { this.setData({ cPhoto: '' }); },

  async submitContrib() {
    if (this.data.submitting) return;
    const { cType, cPhoto, cText, detail } = this.data;
    if (cType === 'photo' && !cPhoto) { wx.showToast({ title: '请先选一张照片', icon: 'none' }); return; }
    if (cType !== 'photo' && (cText || '').trim().length < 5) {
      wx.showToast({ title: '再多写几个字吧', icon: 'none' }); return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });
    try {
      const safe = await S.checkContent((cText || '') + ' ' + (this.data.cPlace || ''), cPhoto, 3);
      if (safe === false) {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '内容未通过校验', icon: 'none' });
        return;
      }
      await wx.cloud.database().collection('bird_contrib').add({
        data: {
          birdId: detail.id,
          birdName: detail.name_cn,
          type: cType,
          photo: cPhoto || '',
          text: (cText || '').trim(),
          place: (this.data.cPlace || '').trim(),
          shotAt: this.data.cShotAt || '',
          nickname: (S.getState().user || {}).name || '雀跃用户',
          status: 'pending',
          createdAt: Date.now(),
          reviewedAt: 0,
          note: ''
        }
      });
      wx.hideLoading();
      this.setData({ showContrib: false, submitting: false });
      wx.showModal({
        title: '已收到，谢谢你',
        content: '我们会逐条核对。被采纳后会替换到图鉴里，并署上你的昵称。',
        showCancel: false, confirmText: '好'
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const d = this.data.detail;
    return d
      ? { title: d.name_cn + ' —— 雀跃鸟种图鉴', path: '/pages/guide/guide?id=' + d.id }
      : { title: '雀跃鸟种图鉴 · 59 种中国常见野鸟', path: '/pages/guide/guide' };
  },
  onShareTimeline() {
    const d = this.data.detail;
    return d
      ? { title: d.name_cn + ' —— 雀跃鸟种图鉴', query: 'id=' + d.id }
      : { title: '雀跃鸟种图鉴 · 59 种中国常见野鸟' };
  }
});
