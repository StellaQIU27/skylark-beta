Page({
  data: { tab: 'rule' },
  onLoad(opt) { if (opt.tab) this.setData({ tab: opt.tab }); },
  toRule() { this.setData({ tab: 'rule' }); },
  toTerms() { this.setData({ tab: 'terms' }); },
  toPrivacy() { this.setData({ tab: 'privacy' }); }
});
