const G = require('../../utils/birds.js');
Page({
  data: { q: '', list: [], detail: null },
  onLoad(opt) {
    this.setData({ list: G.BIRDS });
    if (opt.id) this.openId(opt.id);
  },
  onSearch(e) {
    const q = (e.detail.value || '').trim().toLowerCase();
    const inc = s => (s || '').toLowerCase().indexOf(q) >= 0;
    this.setData({ q, list: q ? G.BIRDS.filter(b => inc(b.name_cn) || inc(b.scientific_name) || inc(b.family_cn) || inc(b.name_en)) : G.BIRDS });
  },
  open(e) { this.openId(e.currentTarget.dataset.id); },
  openId(id) {
    const d = G.BIRDS.find(b => b.id === id);
    if (d) { this.setData({ detail: d }); wx.setNavigationBarTitle({ title: d.name_cn }); }
  },
  back() { this.setData({ detail: null }); wx.setNavigationBarTitle({ title: '鸟种图鉴' }); }
});
