const S = require('../../utils/store.js');

const DAILY_KNOWLEDGE = [
  { tag: '饮食', title: '瓜子和坚果只适合当奖励', body: '日常主食更建议以配方粮和新鲜蔬菜为主，高脂零食少量给，避免鸟宝挑食和体重失控。', channel: 'carehelp' },
  { tag: '安全', title: '厨房油烟和不粘锅涂层要远离鸟宝', body: '鸟的呼吸系统非常敏感，烹饪油烟、香薰、喷雾和过热涂层都可能造成风险。', channel: 'carehelp' },
  { tag: '行为', title: '单脚站立不一定是生病', body: '放松、保暖或睡前都可能单脚站；如果同时炸毛、嗜睡、食欲下降，就要提高警惕。', channel: 'daily' },
  { tag: '护理', title: '换羽期别频繁强行洗澡', body: '换羽时可以提供浅水或喷雾让鸟自己选择，重点是稳定环境、补足营养和观察精神状态。', channel: 'carehelp' },
  { tag: '清洁', title: '饮水器最好每天清洗更换', body: '温暖环境里饮水容易滋生细菌。每天换水、刷洗水杯，是最便宜也最有效的护理习惯。', channel: 'carehelp' },
  { tag: '互动', title: '训练最好短时间、多次数', body: '每次 3 到 5 分钟就够了，用小奖励建立正反馈，比一次练很久更容易让鸟保持兴趣。', channel: 'daily' },
  { tag: '观鸟', title: '野外观鸟先听叫声再找位置', body: '很多鸟会先被听见。安静停留、顺着叫声方向找树冠或灌木边缘，更容易发现它们。', channel: 'wild' }
];

Page({
  data: {
    filter: 'all', list: [], colA: [], colB: [],
    loading: true, unread: 0, ticker: null,
    knowledge: null, showKnow: false
  },

  onLoad() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    const day = Math.floor((d - start) / 86400000);
    this.setData({ knowledge: DAILY_KNOWLEDGE[day % DAILY_KNOWLEDGE.length] });
  },

  async onShow() {
    await getApp().waitReady();
    await S.restorePersonalFromCloud();
    this.load();
    this.buildTicker();
  },

  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },

  async load(done) {
    this.setData({ loading: true });
    const posts = await S.fetchPosts();
    this.allPosts = posts;
    this.applyFilter();
    const notifs = await S.fetchNotifications();
    this.setData({ unread: (notifs || []).filter(n => !n.read).length, loading: false });
    if (done) done();
  },

  applyFilter() {
    const f = this.data.filter;
    let list = this.allPosts || [];
    if (f !== 'all') list = list.filter(p => S.postGroup(p) === f);
    list = list.map(p => Object.assign({}, p, {
      initial: (p.author || '友')[0],
      photoCount: (p.photos || []).length,
      commentCount: (p.comments || []).length,
      isHelp: ['help', 'idhelp'].includes(S.postChannelKey(p)),
      answered: (p.comments || []).length > 0
    }));
    const colA = [], colB = [];
    list.forEach((p, i) => (i % 2 === 0 ? colA : colB).push(p));
    this.setData({ list, colA, colB });
  },

  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.f }, () => this.applyFilter()); },

  buildTicker() {
    const st = S.getState();
    const items = [];
    const pet = st.pets && st.pets[0];
    if (pet) {
      const rec = (st.records[pet.id] || {})[S.todayISO()];
      if (!rec || !rec.weight) items.push({ text: `今天还没记录 ${pet.name} 的体重`, act: 'records' });
    }
    const hot = (this.allPosts || []).filter(p => S.postGroup(p) === 'carehelp' && (p.comments || []).length).length;
    if (hot) items.push({ text: `有 ${hot} 条护理问答正在热议`, act: 'carehelp' });
    if (this.data.knowledge) items.push({ text: `今日鸟识：${this.data.knowledge.title}`, act: 'know' });
    if (!items.length) items.push({ text: '欢迎来到雀跃，记录你和鸟宝的每一天', act: 'records' });
    this.tickers = items; this.ti = 0;
    this.setData({ ticker: items[0] });
    clearInterval(this.tkTimer);
    this.tkTimer = setInterval(() => {
      this.ti = (this.ti + 1) % this.tickers.length;
      this.setData({ ticker: this.tickers[this.ti] });
    }, 4500);
  },
  onHide() { clearInterval(this.tkTimer); },
  onUnload() { clearInterval(this.tkTimer); },

  tickerTap() {
    const t = this.data.ticker; if (!t) return;
    if (t.act === 'records') wx.switchTab({ url: '/pages/records/records' });
    else if (t.act === 'know') this.openKnowledge();
    else wx.navigateTo({ url: '/pages/circle/circle?key=carehelp' });
  },

  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); },
  goSearch() { wx.navigateTo({ url: '/pages/search/search' }); },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },
  goRecords() { wx.switchTab({ url: '/pages/records/records' }); },
  goCommunity() { wx.switchTab({ url: '/pages/community/community' }); },
  goCompose() { wx.navigateTo({ url: '/pages/editor/editor?mode=post' }); },
  soonTip() { wx.showToast({ title: '识鸟功能开发中', icon: 'none' }); },

  openKnowledge() { this.setData({ showKnow: true }); },
  closeKnow() { this.setData({ showKnow: false }); },
  knowGo() {
    const k = this.data.knowledge;
    this.setData({ showKnow: false });
    wx.navigateTo({ url: '/pages/circle/circle?key=' + (k.channel || 'carehelp') });
  }
});
