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
    knowledge: null, showKnow: false,
    hot: [], groups: [], joinedCount: 0, waiting: 0, unread: 0
  },

  onLoad() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    const day = Math.floor((d - start) / 86400000);
    this.setData({
      knowledge: DAILY_KNOWLEDGE[day % DAILY_KNOWLEDGE.length],
      today: `${d.getMonth() + 1}月${d.getDate()}日`,
      // 先渲染圈子（含 logo），云端人数稍后回填
      groups: S.GROUPS.map(g => ({ key: g.key, name: g.name, blurb: g.blurb, icon: g.icon, members: 0 }))
    });
  },

  async onShow() {
    await getApp().waitReady();
    this.load();
  },

  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },

  async load(done) {
    const posts = await S.fetchPosts();
    const counts = await S.fetchCircleCounts();
    const st = S.getState();

    // 热帖排行（评论权重更高）
    const hot = posts
      .filter(p => p.title || p.body || p.photo)
      .map((p, i) => ({
        p, score: (p.comments || []).length * 5 + (p.likes || 0) * 3 + Math.max(0, 8 - i)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => {
        const p = x.p;
        const ch = S.CHAN[S.postChannelKey(p)] || { name: '讨论' };
        return {
          id: p.id, likes: p.likes || 0, author: p.author || '鸟友',
          commentCount: (p.comments || []).length,
          dispTitle: p.title || p.body || '图片动态',
          chanName: ch.name
        };
      });

    const groups = S.GROUPS.map(g => ({
      key: g.key, name: g.name, blurb: g.blurb, icon: g.icon,
      members: counts[g.key] || 0
    }));

    const waiting = posts.filter(p =>
      ['help', 'idhelp'].includes(S.postChannelKey(p)) && !(p.comments || []).length
    ).length;

    const notifs = await S.fetchNotifications();

    this.setData({
      hot, groups, waiting,
      joinedCount: (st.joinedCircles || []).length,
      unread: (notifs || []).filter(n => !n.read).length
    });
    if (done) done();
  },

  enterCircle(e) { wx.navigateTo({ url: '/pages/circle/circle?key=' + e.currentTarget.dataset.key }); },
  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); },
  goMyCircles() {
    const st = S.getState();
    const first = (st.joinedCircles || [])[0];
    if (first) wx.navigateTo({ url: '/pages/circle/circle?key=' + first });
    else wx.showToast({ title: '还没有加入圈子', icon: 'none' });
  },
  goWaiting() { wx.navigateTo({ url: '/pages/circle/circle?key=carehelp' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  goHome() { wx.switchTab({ url: '/pages/home/home' }); },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/notifications' }); },

  openKnowledge() { this.setData({ showKnow: true }); },
  closeKnow() { this.setData({ showKnow: false }); },
  knowGo() {
    const k = this.data.knowledge;
    this.setData({ showKnow: false });
    wx.navigateTo({ url: '/pages/circle/circle?key=' + (k.channel || 'carehelp') });
  }
});
