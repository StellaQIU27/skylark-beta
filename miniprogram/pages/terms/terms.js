const F = require('../../utils/features.js');

Page({
  data: { comm: F.COMMUNITY, tab: F.COMMUNITY ? 'rule' : 'terms' },
  onLoad(opt) {
    let t = opt.tab || (F.COMMUNITY ? 'rule' : 'terms');
    if (!F.COMMUNITY && t === 'rule') t = 'terms';
    this.setData({ tab: t });
  },
  toRule() { this.setData({ tab: 'rule' }); },
  toTerms() { this.setData({ tab: 'terms' }); },
  toPrivacy() { this.setData({ tab: 'privacy' }); }
});
