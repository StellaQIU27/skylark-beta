// 记录版守卫：COMMUNITY 关闭时此页不可用
const __F = require('../../utils/features.js');
let __bounced = false;
function __commGuard() {
  if (__F.COMMUNITY) return false;
  if (!__bounced) {
    __bounced = true;
    wx.showToast({ title: '该功能暂未开放', icon: 'none' });
    setTimeout(function () { __bounced = false; wx.switchTab({ url: '/pages/home/home' }); }, 500);
  }
  return true;
}

const S = require('../../utils/store.js');

const PINNED_SOURCE = '内容整理自公开兽医科普资料（VIN / Best Friends / 鹦鹉协会等）· 内测版尚未经执业兽医逐条审核 · 更新于 2026-05';
const PINNED_POSTS = {
  carehelp: [
    {
      id: 'pin-1', author: '官方护理指南', time: '更新于 2026-05', source: PINNED_SOURCE,
      title: '科学饮食：滋养丸为主，瓜子只能当零食',
      body: '很多人以为鹦鹉就该吃瓜子，其实瓜子脂肪极高（葵花籽含脂量约 49%，是巧克力的三倍），长期吃容易肥胖、脂肪肝。\n\n禽类兽医普遍建议的日常配比：配方滋养丸（pellets）占 50–70%，新鲜蔬菜占 30–50%，瓜子/坚果/水果合计不超过 10–20%（当奖励就好）。换粮要循序渐进，最好先咨询禽鸟专科兽医。\n\n⚠️ 本文为通用护理科普，具体请以兽医诊断为准。'
    },
    {
      id: 'pin-2', author: '官方护理指南', time: '更新于 2026-05', source: PINNED_SOURCE,
      title: '这些都是生病信号，别拖！',
      body: '鸟天生会"藏病"，等你看出明显异常时，往往已经病了好几天。出现以下信号要警惕：\n\n• 整天炸毛、缩成一团\n• 白天反常昏睡、精神不振\n• 食欲骤降（鸟代谢快，超过几小时不吃就该看医生）\n• 停在笼底不动\n• 张口呼吸 / 尾巴随呼吸一上一下\n• 鼻孔、眼睛有分泌物或结痂\n• 粪便颜色、形状明显改变\n\n其中「张口呼吸、长时间不吃、缩在笼底」属于急症，请立刻联系禽鸟专科兽医。'
    },
    {
      id: 'pin-3', author: '官方护理指南', time: '更新于 2026-05', source: PINNED_SOURCE,
      title: '绝对不能喂的食物清单',
      body: '这些食物对鸟可能致命，千万别喂：\n\n• 牛油果（鳄梨）——含 persin，可致心脏衰竭、突然死亡\n• 巧克力——含可可碱和咖啡因，会引起呕吐、抽搐\n• 咖啡因（咖啡 / 茶 / 可乐 / 功能饮料）\n• 酒精\n• 洋葱、大蒜等葱属——伤消化道、肝脏，可致贫血\n• 含木糖醇的食品\n\n一旦误食，请尽快就医。不确定某种食物是否安全时，先问兽医再喂。'
    }
  ]
};

Page({
  data: {
    key: 'daily', group: {}, members: 0, joined: false,
    pinned: [], shownPinned: [], showAll: false,
    list: [], colA: [], colB: [], isList: false,
    showPin: false, curPin: {}
  },

  onLoad(opt) {
    if (__commGuard()) return;
    const key = opt.key || 'daily';
    const group = S.GROUP[key] || S.GROUPS[0];
    const pinned = PINNED_POSTS[key] || [];
    wx.setNavigationBarTitle({ title: group.name });
    this.setData({
      key, group, pinned,
      shownPinned: pinned.slice(0, 1),
      isList: key === 'carehelp'
    });
  },

  async onShow() {

    if (__commGuard()) return;
    await getApp().waitReady();
    this.load();
  },

  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },

  async load(done) {
    const key = this.data.key;
    const posts = await S.fetchPosts();
    const counts = await S.fetchCircleCounts();
    const st = S.getState();

    const list = posts.filter(p => S.postGroup(p) === key).map(p => Object.assign({}, p, {
      initial: (p.author || '友')[0],
      photoCount: (p.photos || []).length,
      commentCount: (p.comments || []).length,
      isHelp: ['help', 'idhelp'].includes(S.postChannelKey(p)),
      answered: (p.comments || []).length > 0
    }));
    const colA = [], colB = [];
    list.forEach((p, i) => (i % 2 === 0 ? colA : colB).push(p));

    this.setData({
      list, colA, colB,
      members: counts[key] || 0,
      joined: (st.joinedCircles || []).includes(key)
    });
    if (done) done();
  },

  async toggleJoin() {
    const key = this.data.key;
    const st = S.getState();
    if (!st.joinedCircles) st.joinedCircles = [];
    const joining = !this.data.joined;
    if (joining) { st.joinedCircles.push(key); wx.showToast({ title: '已加入圈子', icon: 'none' }); }
    else st.joinedCircles = st.joinedCircles.filter(k => k !== key);
    S.saveState();
    this.setData({ joined: joining, members: Math.max(0, this.data.members + (joining ? 1 : -1)) });
    try { await S.joinCircle(key, joining); } catch (e) {}
  },

  toggleAllPinned() {
    const showAll = !this.data.showAll;
    this.setData({ showAll, shownPinned: showAll ? this.data.pinned : this.data.pinned.slice(0, 1) });
  },
  openPinned(e) {
    this.setData({ showPin: true, curPin: this.data.shownPinned[e.currentTarget.dataset.idx] });
  },
  closePin() { this.setData({ showPin: false }); },

  openPost(e) { wx.navigateTo({ url: '/pages/post/post?id=' + e.currentTarget.dataset.id }); },
  goCompose() {
    wx.navigateTo({ url: '/pages/editor/editor?mode=post&channel=' + S.groupPrimaryChannel(this.data.key) });
  }
});
