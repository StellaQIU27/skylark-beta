const S = require('../../utils/store.js');
Page({
  data: { groups: [], total: 0 },
  async onShow() {
    await getApp().waitReady();
    await S.restorePersonalFromCloud();
    const st = S.getState();
    const groups = []; let total = 0;
    (st.pets || []).forEach(pet => {
      const recs = st.records[pet.id] || {};
      Object.keys(recs).sort().reverse().forEach(d => {
        const r = recs[d] || {};
        if ((r.photos || []).length) {
          const dd = d.split('-');
          groups.push({
            key: pet.id + d, date: `${+dd[1]}月${+dd[2]}日`, petName: pet.name,
            photos: r.photos, notes: r.notes || ''
          });
          total += r.photos.length;
        }
      });
    });
    this.setData({ groups, total });
  },
  preview(e) { wx.previewImage({ current: e.currentTarget.dataset.src, urls: e.currentTarget.dataset.all }); }
});
