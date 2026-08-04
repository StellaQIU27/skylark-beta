const S = require('../../utils/store.js');
const F = require('../../utils/features.js');

const BASE_FAQS = [
  { q: '换手机后数据还在吗？', a: '在。你的爱鸟档案和每日记录会自动同步到云端，跟随你的微信号。换设备登录同一个微信，打开雀跃就会自动恢复。', open: false },
  { q: '之前用网页版，怎么迁移数据？', a: '先在网页版「我的 → 数据备份 → 导出备份文件」保存 JSON 文件，然后在小程序「我的 → 数据备份 → 从旧版网页迁移」选择文件或粘贴内容导入即可。', open: false },
  { q: '怎么记录体重和喂食？', a: '进入「记录」，选择一只爱鸟，点「添加新记录」。体重默认会带出上一次的数值，微调即可；喂食可以按时间多次记录，并选择食物种类。', open: false },
  { q: '换羽期怎么记录？', a: '在某只爱鸟的记录页，体重走势下方有「换羽期」卡片，填写开始日期即可。换羽结束后再补填结束日期，期间会显示已换羽的天数。', open: false },
  { q: '记录可以删除吗？', a: '可以。进入某只爱鸟的记录页，在对应日期的记录卡片上长按或点开，选择「删除本日记录」即可。', open: false },
  { q: '一只鸟能记录多少张照片？', a: '每天最多 9 张，会自动汇总到「我的 → 鸟宝相册」里，按时间倒序排列。', open: false },
  { q: '「识鸟」为什么用不了？', a: '拍照识别功能还在开发中，暂时不可用。目前可以在「鸟种图鉴」里按名称、学名或科搜索查看 59 种常见野鸟。', open: false },
  { q: '小知识和护理指南可信吗？', a: '内容整理自公开的禽鸟兽医科普资料，仅供参考，尚未经执业兽医逐条审核。鸟宝出现异常请及时就医。', open: false }
];

// 社区相关 FAQ（COMMUNITY 开关打开时才追加）
const COMMUNITY_FAQS = [
  { q: '发帖可以传几张图？', a: '最多 6 张，支持调整顺序。第一张会作为封面显示在信息流里。', open: false },
  { q: '帖子和评论可以删除吗？', a: '可以，但只能删除自己发布的。进入自己的动态详情页，会看到「编辑」和「删除」；自己的评论下方也有「删除」。', open: false },
  { q: '加入圈子有什么用？', a: '加入圈子主要用于表达兴趣、统计真实成员数。后续会推出「只看已加入圈子的动态」等个性化功能。', open: false }
];

const FAQS = F.COMMUNITY ? BASE_FAQS.concat(COMMUNITY_FAQS) : BASE_FAQS;

Page({
  data: {
    faqs: FAQS, types: ['功能建议', '使用问题', '内容纠错', '其他'],
    type: '功能建议', text: '', contact: '', mine: [], version: 'v1.0.0'
  },

  async onShow() {
    await getApp().waitReady();
    this.loadMine();
  },

  toggle(e) {
    const i = e.currentTarget.dataset.i;
    const faqs = this.data.faqs.map((f, k) => k === +i ? Object.assign({}, f, { open: !f.open }) : f);
    this.setData({ faqs });
  },
  pickType(e) { this.setData({ type: e.currentTarget.dataset.t }); },
  onText(e) { this.setData({ text: e.detail.value }); },
  onContact(e) { this.data.contact = e.detail.value; },

  async submit() {
    const text = (this.data.text || '').trim();
    if (text.length < 5) { wx.showToast({ title: '再多写几个字吧', icon: 'none' }); return; }
    wx.showLoading({ title: '提交中' });
    try {
      await wx.cloud.database().collection('feedback').add({
        data: {
          type: this.data.type, text,
          contact: (this.data.contact || '').trim(),
          nickname: (S.getState().user || {}).name || '雀跃用户',
          version: this.data.version,
          createdAt: Date.now(), reply: ''
        }
      });
      wx.hideLoading();
      this.setData({ text: '', contact: '' });
      wx.showToast({ title: '已收到，谢谢反馈！', icon: 'none' });
      this.loadMine();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' });
    }
  },

  async loadMine() {
    try {
      const openid = getApp().globalData.openid;
      const { data } = await wx.cloud.database().collection('feedback')
        .where({ _openid: openid }).orderBy('createdAt', 'desc').limit(20).get();
      this.setData({
        mine: (data || []).map(f => Object.assign({}, f, { timeText: S.fmtTime(f.createdAt) }))
      });
    } catch (e) { /* 集合未建时忽略 */ }
  }
});
