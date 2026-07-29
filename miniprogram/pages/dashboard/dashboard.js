Page({
  data: { loading: true, err: '', kpis: [], dau: [], events: [], users: [] },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  async load(done) {
    this.setData({ loading: true, err: '' });
    try {
      const res = await wx.cloud.callFunction({ name: 'analytics' });
      const r = res.result || {};
      if (r.error) {
        this.setData({ loading: false, err: r.error + '（你的 openid：' + (r.yourOpenid || '') + '）' });
        if (done) done(); return;
      }
      const s = r.summary || {};
      const kpis = Object.keys(s).map(k => ({ k, v: s[k] }));
      const maxU = Math.max(1, ...(r.dau || []).map(d => d.users));
      const dau = (r.dau || []).slice(-14).map(d => ({ ...d, w: Math.round(d.users / maxU * 100) }));
      const events = Object.keys(r.events || {}).map(n => ({ name: n, count: r.events[n] }))
        .sort((a, b) => b.count - a.count);
      this.setData({ loading: false, kpis, dau, events, users: r.users || [] });
    } catch (e) {
      this.setData({ loading: false, err: '云函数 analytics 未部署或调用失败' });
    }
    if (done) done();
  }
});
