const S = require('../../utils/store.js');
Page({
  data: { list: [] },
  onShow() {
    const list = (S.getState().draftList || []).map(d => Object.assign({}, d, {
      chanName: (S.CHAN[d.channel] || { name: '讨论' }).name
    }));
    this.setData({ list });
  },
  resume(e) {
    const st = S.getState();
    const d = (st.draftList || []).find(x => x.id === e.currentTarget.dataset.id);
    if (!d) return;
    st.draftList = st.draftList.filter(x => x.id !== d.id);
    S.saveState();
    wx.navigateTo({ url: '/pages/editor/editor?mode=post&channel=' + d.channel });
  },
  del(e) {
    const st = S.getState();
    st.draftList = (st.draftList || []).filter(x => x.id !== e.currentTarget.dataset.id);
    S.saveState();
    this.onShow();
    wx.showToast({ title: '草稿已删除', icon: 'none' });
  }
});
