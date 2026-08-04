const S = require('../../utils/store.js');

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const BATH_MAP = { active: '主动洗澡', spray: '喷水洗澡', none: '未洗澡' };

function parseDate(iso) { const a = iso.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function daysBefore(iso, n) { const d = parseDate(iso); d.setDate(d.getDate() - n); return isoOf(d); }
function petAge(pet) {
  if (!pet.birth) return pet.age || '新成员';
  const b = pet.birth.split('-');
  const bd = new Date(+b[0], +b[1] - 1, 1), now = new Date();
  let m = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  if (m < 0) m = 0;
  const y = Math.floor(m / 12), mm = m % 12;
  return y ? `${y}岁${mm}个月` : `${mm}个月`;
}

Page({
  data: {
    listMode: true, manageMode: false,
    pets: [], pet: null, records: [], dayCount: 0, avgWeight: '—',
    chart: [], yMax: 100, yMid: 90, yMin: 80,
    molt: {}, showMolt: false, moltStart: '', moltEnd: ''
  },

  async onShow() {
    await getApp().waitReady();
    await S.restorePersonalFromCloud();
    // 从 tab 进入时始终回到「我的爱鸟」列表（与 Web 版一致）
    if (this.backFromDetail) { this.backFromDetail = false; }
    else if (!this.keepDetail) {
      const st = S.getState();
      st.activePetId = null;
      this.setData({ listMode: true, manageMode: false });
    }
    this.keepDetail = false;
    this.render();
  },

  render() {
    const st = S.getState();
    const pets = (st.pets || []).map(p => {
      const recs = st.records[p.id] || {};
      return Object.assign({}, p, {
        avatar: S.avatarSrc(p),
        ageText: petAge(p),
        weightText: p.weight ? p.weight.toFixed(1) : '—',
        dayCount: Object.keys(recs).length
      });
    });

    // 未选中任何一只 -> 显示列表（不管有几只鸟）
    if (!pets.length || !st.activePetId) {
      this.setData({ listMode: true, pets });
      return;
    }
    const pet = pets.find(p => p.id === st.activePetId);
    if (!pet) { st.activePetId = null; this.setData({ listMode: true, pets }); return; }

    this.renderTimeline(st, pet, pets);
  },

  renderTimeline(st, pet, pets) {
    const recs = st.records[pet.id] || {};
    const dates = Object.keys(recs).sort().reverse();
    const weights = Object.values(recs).map(r => r.weight).filter(w => w);
    const avg = weights.length ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) + 'g' : '—';

    // 日记列表
    let lastMonth = '';
    const records = dates.map(d => {
      const rec = recs[d] || {};
      const dd = parseDate(d);
      const mh = `${dd.getFullYear()}年 ${dd.getMonth() + 1}月`;
      const monthHead = mh !== lastMonth ? (lastMonth = mh, mh) : '';
      const prev = recs[daysBefore(d, 1)];
      let delta = '', deltaDown = false;
      if (prev && rec.weight && prev.weight) {
        const dv = rec.weight - prev.weight;
        if (Math.abs(dv) >= 0.05) { deltaDown = dv < 0; delta = (dv > 0 ? '↑' : '↓') + Math.abs(dv).toFixed(1); }
      }
      const today = S.todayISO();
      const dayLabel = d === today ? '今天' : (d === daysBefore(today, 1) ? '昨天' : `${dd.getMonth() + 1}月${dd.getDate()}日`);
      const fc = (rec.feedings || []).length;
      return {
        date: d, monthHead, dayLabel, weekday: WD[dd.getDay()],
        weight: rec.weight ? rec.weight.toFixed(1) : '', delta, deltaDown,
        foodsText: fc ? `${fc} 次喂食` : '—',
        bathText: rec.bath ? BATH_MAP[rec.bath] : '—',
        sunText: rec.sunMinutes ? rec.sunMinutes + ' 分钟' : '—',
        notes: rec.notes || '', photos: rec.photos || []
      };
    });

    // 近 7 天柱状图
    const today = S.todayISO();
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(daysBefore(today, i));
    const vals = days.map(d => (recs[d] && recs[d].weight) || 0);
    const nz = vals.filter(v => v);
    const max = nz.length ? Math.max.apply(null, nz) : 100;
    const min = nz.length ? Math.min.apply(null, nz) : 80;
    const hi = Math.ceil(max + 2), lo = Math.floor(Math.max(0, min - 2));
    const span = Math.max(1, hi - lo);
    const chart = days.map((d, i) => {
      const w = vals[i];
      const dd = parseDate(d);
      return {
        date: d, w: w ? w.toFixed(1) : '',
        h: w ? Math.max(6, ((w - lo) / span) * 100) : 0,
        label: d === today ? '今天' : `${dd.getMonth() + 1}/${dd.getDate()}`
      };
    });

    // 换羽状态
    const m = pet.molt;
    let molt = { cls: '', label: '', range: '' };
    if (m && m.start) {
      const fmt = iso => { const a = iso.split('-'); return `${+a[1]}月${+a[2]}日`; };
      if (m.end && today > m.end) molt = { cls: 'done', label: '已结束', range: `${fmt(m.start)} – ${fmt(m.end)}` };
      else if (today < m.start) molt = { cls: 'pre', label: '未开始', range: `${fmt(m.start)} 起` };
      else {
        const n = Math.floor((parseDate(today) - parseDate(m.start)) / 86400000) + 1;
        molt = { cls: 'on', label: `换羽中 · 第 ${n} 天`, range: m.end ? `${fmt(m.start)} – ${fmt(m.end)}` : `${fmt(m.start)} 起` };
      }
    }

    this.setData({
      listMode: false, pets, pet, records, chart, molt,
      dayCount: dates.length, avgWeight: avg,
      yMax: hi, yMid: Math.round((hi + lo) / 2), yMin: lo,
      moltStart: (m && m.start) || '', moltEnd: (m && m.end) || ''
    });
  },

  toggleManage() { this.setData({ manageMode: !this.data.manageMode }); },

  tapPet(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.manageMode) { this.editPetById(id); return; }
    const st = S.getState();
    st.activePetId = id;
    S.saveState();
    this.render();
  },
  backToList() {
    const st = S.getState();
    st.activePetId = null;
    S.saveState();
    this.setData({ listMode: true, manageMode: false });
    this.render();
  },
  editPet(e) { this.keepDetail = true; this.editPetById(e.currentTarget.dataset.id); },
  editPetById(id) { this.keepDetail = true; wx.navigateTo({ url: '/pages/editor/editor?mode=pet&id=' + id }); },
  addPet() { this.keepDetail = true; wx.navigateTo({ url: '/pages/editor/editor?mode=pet' }); },

  deletePet(e) {
    const id = e.currentTarget.dataset.id;
    const st = S.getState();
    const pet = (st.pets || []).find(p => p.id === id);
    if (!pet) return;
    wx.showModal({
      title: '删除爱鸟', content: `确定删除「${pet.name}」吗？\nTA 的所有记录也会一并删除。`,
      success: r => {
        if (!r.confirm) return;
        st.pets = st.pets.filter(p => p.id !== id);
        if (st.records[id]) delete st.records[id];
        if (st.activePetId === id) st.activePetId = null;
        S.saveState();
        this.setData({ manageMode: false });
        this.render();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  newRecord() { this.keepDetail = true; wx.navigateTo({ url: '/pages/editor/editor?mode=record&date=' + S.todayISO() }); },
  makeCard() {
    if (!this.data.records.length) { wx.showToast({ title: '先添加一条记录吧', icon: 'none' }); return; }
    this.keepDetail = true;
    wx.navigateTo({ url: '/pages/card/card?pet=' + this.data.pet.id + '&date=' + this.data.records[0].date });
  },
  openRecord(e) { this.keepDetail = true; wx.navigateTo({ url: '/pages/editor/editor?mode=record&date=' + e.currentTarget.dataset.date }); },

  openMolt() { this.setData({ showMolt: true }); },
  closeMolt() { this.setData({ showMolt: false }); },
  pickMoltStart(e) { this.setData({ moltStart: e.detail.value }); },
  pickMoltEnd(e) { this.setData({ moltEnd: e.detail.value }); },
  saveMolt() {
    if (!this.data.moltStart) { wx.showToast({ title: '请选择开始日期', icon: 'none' }); return; }
    if (this.data.moltEnd && this.data.moltEnd < this.data.moltStart) { wx.showToast({ title: '结束不能早于开始', icon: 'none' }); return; }
    const st = S.getState();
    const pet = st.pets.find(p => p.id === st.activePetId);
    if (pet) { pet.molt = { start: this.data.moltStart, end: this.data.moltEnd || '' }; S.saveState(); }
    this.setData({ showMolt: false });
    this.render();
    wx.showToast({ title: '换羽期已记录', icon: 'none' });
  },
  clearMolt() {
    const st = S.getState();
    const pet = st.pets.find(p => p.id === st.activePetId);
    if (pet) { pet.molt = null; S.saveState(); }
    this.setData({ showMolt: false, moltStart: '', moltEnd: '' });
    this.render();
  },

  onShareAppMessage() {
    const p = this.data.pet;
    return {
      title: p && p.name ? ('我在雀跃记录 ' + p.name + ' 的每一天') : '雀跃 · 给鸟宝建个养护档案',
      path: '/pages/home/home'
    };
  },
  onShareTimeline() {
    return { title: '雀跃 · 给鸟宝建个养护档案，记录体重、喂食与换羽' };
  }
});
