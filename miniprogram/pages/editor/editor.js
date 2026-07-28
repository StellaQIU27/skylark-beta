const S = require('../../utils/store.js');

const CHANNEL_FIELDS = {
  help: [['age', '年龄', '例如 1岁2个月'], ['symptoms', '症状', '例如 精神不振、拉稀'], ['diet', '饮食', '例如 主粮+滋养丸'], ['weightChange', '体重变化', '例如 一周降 3g']],
  birding: [['place', '地点', '例如 杭州西溪湿地'], ['time', '时间', '例如 清晨 6:30'], ['confidence', '识别置信度', '例如 比较确定 / 待确认']],
  idhelp: [['place', '地点', '例如 哪里拍到的'], ['time', '时间', '例如 今天上午']]
};
const FOODS = [
  { key: '谷子', img: '/images/food-grain.png' }, { key: '小米', img: '/images/food-millet.png' },
  { key: '水果', img: '/images/food-fruit.png' }, { key: '青菜', img: '/images/food-veggies.png' },
  { key: '蛋类', img: '/images/food-egg.png' }, { key: '乳制品', img: '/images/food-dairy.png' },
  { key: '鱼类', img: '/images/food-fish.png' }, { key: '肉类', img: '/images/food-meat.png' },
  { key: '豆类', img: '/images/food-beans.png' }, { key: '坚果', img: '/images/food-nuts.png' },
  { key: '主食', img: '/images/food-staple.png' }, { key: '油脂', img: '/images/food-oil.png' },
  { key: '菌菇', img: '/images/food-mushroom.png' }, { key: '饮品', img: '/images/food-drink.png' }
];
const WD = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    mode: 'post', editId: null,
    // 发帖
    groups: [], group: 'daily', channel: 'share', title: '', body: '', photos: [], fields: [],
    // 爱鸟
    speciesList: [], petSpecies: '玄凤鹦鹉', petAvatar: '', petColor: '#D9B068',
    petName: '', petBirth: '', petGender: 'm', petPhoto: null, custom: false, petId: null,
    // 记录
    date: '', dateLabel: '', pet: {}, rec: { weight: 0, feedings: [], sunMinutes: 0, bath: '', notes: '', photos: [] },
    showWeight: false, weightInput: '90.0',
    showFeeding: false, feedTime: '08:00', foodOpts: [],
    showDate: false
  },

  async onLoad(opt) {
    const mode = opt.mode || 'post';
    this.setData({ mode });
    await getApp().waitReady();

    if (mode === 'post') {
      wx.setNavigationBarTitle({ title: opt.edit ? '编辑动态' : '发布动态' });
      const groups = S.GROUPS.map(g => ({ key: g.key, name: g.name }));
      const channel = opt.channel || 'share';
      this.setData({ groups, channel, group: S.GROUP_OF[channel] || 'daily' });
      this.syncFields();
      if (opt.edit) await this.loadPostForEdit(opt.edit);
    } else if (mode === 'pet') {
      wx.setNavigationBarTitle({ title: opt.id ? '编辑爱鸟' : '添加爱鸟' });
      this.setData({ speciesList: S.SPECIES_LIST });
      if (opt.id) this.loadPet(opt.id);
      else this.applySpecies('玄凤鹦鹉');
    } else {
      wx.setNavigationBarTitle({ title: '每日记录' });
      this.loadRecord(opt.date || S.todayISO());
    }
  },

  /* ---------- 发帖 ---------- */
  async loadPostForEdit(id) {
    const posts = await S.fetchPosts();
    const p = posts.find(x => String(x.id) === String(id));
    if (!p) return;
    this.setData({
      editId: id, title: p.title || '', body: p.body || '',
      photos: p.photos || [], channel: S.postChannelKey(p),
      group: S.postGroup(p)
    });
    this.syncFields(p.fields || {});
  },
  syncFields(vals) {
    const defs = CHANNEL_FIELDS[this.data.channel] || [];
    const v = vals || {};
    this.setData({ fields: defs.map(([k, label, ph]) => ({ k, label, ph, v: v[k] || '' })) });
  },
  pickGroup(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ group: key, channel: S.groupPrimaryChannel(key) });
    this.syncFields();
  },
  onTitle(e) { this.data.title = e.detail.value; },
  onBody(e) { this.data.body = e.detail.value; },
  onField(e) {
    const k = e.currentTarget.dataset.k;
    const fields = this.data.fields.map(f => f.k === k ? Object.assign({}, f, { v: e.detail.value }) : f);
    this.data.fields = fields;
  },

  addPhoto() {
    const room = 6 - this.data.photos.length;
    wx.chooseMedia({
      count: room, mediaType: ['image'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中' });
        const urls = [];
        for (const f of res.tempFiles) {
          try {
            const up = await wx.cloud.uploadFile({
              cloudPath: `posts/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
              filePath: f.tempFilePath
            });
            urls.push(up.fileID);
          } catch (e) {}
        }
        wx.hideLoading();
        this.setData({ photos: this.data.photos.concat(urls) });
      }
    });
  },
  removePhoto(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.slice(); photos.splice(i, 1);
    this.setData({ photos });
  },
  movePhoto(e) {
    const i = +e.currentTarget.dataset.i, d = +e.currentTarget.dataset.d, j = i + d;
    const photos = this.data.photos.slice();
    if (j < 0 || j >= photos.length) return;
    const t = photos[i]; photos[i] = photos[j]; photos[j] = t;
    this.setData({ photos });
  },
  previewPhoto(e) { wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.photos }); },

  saveDraft() {
    const st = S.getState();
    if (!this.data.title && !this.data.body && !this.data.photos.length) { wx.showToast({ title: '草稿是空的', icon: 'none' }); return; }
    if (!st.draftList) st.draftList = [];
    st.draftList.unshift({
      id: 'draft_' + Date.now(), channel: this.data.channel,
      title: this.data.title, body: this.data.body, photos: this.data.photos,
      fields: this.fieldVals(), time: S.fmtTime(Date.now())
    });
    S.saveState();
    wx.showToast({ title: '已存到草稿箱', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 500);
  },
  fieldVals() {
    const o = {};
    (this.data.fields || []).forEach(f => { if ((f.v || '').trim()) o[f.k] = f.v.trim(); });
    return o;
  },
  async publish() {
    const title = (this.data.title || '').trim();
    const body = (this.data.body || '').trim();
    const fields = this.fieldVals();
    if (!title && !body && !this.data.photos.length && !Object.keys(fields).length) {
      wx.showToast({ title: '写点什么再发布吧', icon: 'none' }); return;
    }
    const domain = (S.CHAN[this.data.channel] || {}).domain || 'general';
    wx.showLoading({ title: this.data.editId ? '更新中' : '发布中' });
    try {
      if (this.data.editId) {
        await S.updatePost(this.data.editId, {
          channel: this.data.channel, domain, title, body, photos: this.data.photos, fields
        });
      } else {
        await S.addPost({ channel: this.data.channel, domain, title, body, photos: this.data.photos, fields });
      }
      wx.hideLoading();
      wx.showToast({ title: this.data.editId ? '已更新' : '已发布', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /* ---------- 爱鸟档案 ---------- */
  loadPet(id) {
    const st = S.getState();
    const pet = (st.pets || []).find(p => p.id === id);
    if (!pet) return;
    const isCustom = !S.SPECIES_LIST.some(s => s.name === pet.species);
    this.setData({
      petId: id, petName: pet.name, petSpecies: pet.species, petGender: pet.gender,
      petBirth: pet.birth || '', petPhoto: pet.photo || null, custom: isCustom,
      petAvatar: S.SPECIES_AVATARS[pet.species] || '', petColor: pet.color || '#8BA88B'
    });
  },
  applySpecies(name) {
    this.setData({
      petSpecies: name, custom: false,
      petAvatar: S.SPECIES_AVATARS[name] || '',
      petColor: S.SPECIES_COLOR[name] || '#8BA88B'
    });
  },
  pickSpecies(e) { this.applySpecies(e.currentTarget.dataset.name); },
  pickCustom() { this.setData({ custom: true, petSpecies: '', petAvatar: '', petColor: '#8BA88B' }); },
  onCustomSpecies(e) { this.data.petSpecies = e.detail.value; },
  onPetName(e) { this.data.petName = e.detail.value; },
  pickBirth(e) { this.setData({ petBirth: e.detail.value }); },
  pickGender(e) { this.setData({ petGender: e.currentTarget.dataset.g }); },
  pickPetPhoto() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中' });
        try {
          const up = await wx.cloud.uploadFile({
            cloudPath: `pets/${Date.now()}.jpg`, filePath: res.tempFiles[0].tempFilePath
          });
          this.setData({ petPhoto: up.fileID });
        } catch (e) {}
        wx.hideLoading();
      }
    });
  },
  savePet() {
    const name = (this.data.petName || '').trim();
    if (!name) { wx.showToast({ title: '请给 TA 起个名字', icon: 'none' }); return; }
    const species = (this.data.petSpecies || '').trim();
    if (!species) { wx.showToast({ title: '请选择或输入品种', icon: 'none' }); return; }
    const st = S.getState();
    const color = S.SPECIES_COLOR[species] || '#8BA88B';
    if (this.data.petId) {
      const pet = st.pets.find(p => p.id === this.data.petId);
      if (pet) Object.assign(pet, {
        name, species, gender: this.data.petGender, birth: this.data.petBirth,
        color, initial: name[0], photo: this.data.petPhoto || null
      });
    } else {
      const id = 'pet_' + Date.now();
      st.pets.push({
        id, name, species, gender: this.data.petGender, birth: this.data.petBirth,
        age: '新成员', weight: 0, color, initial: name[0], photo: this.data.petPhoto || null
      });
      st.activePetId = id;
    }
    S.saveState();
    wx.showToast({ title: '已保存', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 500);
  },

  /* ---------- 每日记录 ---------- */
  loadRecord(date) {
    const st = S.getState();
    const pet = (st.pets || []).find(p => p.id === st.activePetId) || (st.pets || [])[0];
    if (!pet) { wx.showToast({ title: '请先添加爱鸟', icon: 'none' }); setTimeout(() => wx.navigateBack(), 800); return; }
    if (!st.records[pet.id]) st.records[pet.id] = {};
    const raw = st.records[pet.id][date] || {};
    const rec = {
      weight: raw.weight || 0,
      feedings: (raw.feedings || []).map(f => Object.assign({}, f, { foodsText: (f.foods || []).join('、') })),
      sunMinutes: raw.sunMinutes || 0, bath: raw.bath || '',
      notes: raw.notes || '', photos: raw.photos || []
    };
    const d = date.split('-');
    const dd = new Date(+d[0], +d[1] - 1, +d[2]);
    this.setData({
      date, pet, rec,
      dateLabel: `${dd.getFullYear()}年${dd.getMonth() + 1}月${dd.getDate()}日 周${WD[dd.getDay()]}`,
      weightInput: (raw.weight || this.lastWeight(st, pet.id) || 90).toFixed(1)
    });
  },
  lastWeight(st, petId) {
    const recs = st.records[petId] || {};
    const ds = Object.keys(recs).filter(d => recs[d] && recs[d].weight).sort();
    return ds.length ? recs[ds[ds.length - 1]].weight : 0;
  },

  openDatePicker() { this.setData({ showDate: true }); },
  closeDate() { this.setData({ showDate: false }); },
  pickDate(e) { this.setData({ showDate: false }); this.loadRecord(e.detail.value); },

  openWeight() { this.setData({ showWeight: true }); },
  closeWeight() { this.setData({ showWeight: false }); },
  onWeightInput(e) { this.data.weightInput = e.detail.value; },
  bumpUp() { this.setData({ weightInput: (parseFloat(this.data.weightInput || 0) + 0.1).toFixed(1) }); },
  bumpDown() { this.setData({ weightInput: Math.max(0, parseFloat(this.data.weightInput || 0) - 0.1).toFixed(1) }); },
  saveWeight() {
    const v = parseFloat(this.data.weightInput);
    if (isNaN(v) || v <= 0) { wx.showToast({ title: '请输入有效体重', icon: 'none' }); return; }
    this.setData({ 'rec.weight': +v.toFixed(1), showWeight: false });
  },

  openFeeding() {
    this.setData({ showFeeding: true, feedTime: '08:00', foodOpts: FOODS.map(f => Object.assign({}, f, { on: false })) });
  },
  closeFeeding() { this.setData({ showFeeding: false }); },
  pickFeedTime(e) { this.setData({ feedTime: e.detail.value }); },
  toggleFood(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ foodOpts: this.data.foodOpts.map(f => f.key === key ? Object.assign({}, f, { on: !f.on }) : f) });
  },
  saveFeeding() {
    const foods = this.data.foodOpts.filter(f => f.on).map(f => f.key);
    const feedings = this.data.rec.feedings.concat([{
      id: Date.now(), time: this.data.feedTime, foods, foodsText: foods.join('、')
    }]);
    this.setData({ 'rec.feedings': feedings, showFeeding: false });
  },
  removeFeeding(e) {
    const feedings = this.data.rec.feedings.slice();
    feedings.splice(e.currentTarget.dataset.i, 1);
    this.setData({ 'rec.feedings': feedings });
  },

  pickSun(e) { this.setData({ 'rec.sunMinutes': +e.currentTarget.dataset.v }); },
  pickBath(e) { this.setData({ 'rec.bath': e.currentTarget.dataset.v }); },
  onNotes(e) { this.data.rec.notes = e.detail.value; },

  addRecPhoto() {
    const room = 9 - this.data.rec.photos.length;
    wx.chooseMedia({
      count: room, mediaType: ['image'], sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中' });
        const urls = [];
        for (const f of res.tempFiles) {
          try {
            const up = await wx.cloud.uploadFile({
              cloudPath: `records/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
              filePath: f.tempFilePath
            });
            urls.push(up.fileID);
          } catch (e) {}
        }
        wx.hideLoading();
        this.setData({ 'rec.photos': this.data.rec.photos.concat(urls) });
      }
    });
  },
  removeRecPhoto(e) {
    const photos = this.data.rec.photos.slice();
    photos.splice(e.currentTarget.dataset.i, 1);
    this.setData({ 'rec.photos': photos });
  },
  previewRecPhoto(e) { wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.rec.photos }); },

  saveRecord() {
    const st = S.getState();
    const pet = this.data.pet;
    const r = this.data.rec;
    if (!st.records[pet.id]) st.records[pet.id] = {};
    st.records[pet.id][this.data.date] = {
      weight: r.weight || 0,
      feedings: (r.feedings || []).map(f => ({ id: f.id, time: f.time, foods: f.foods })),
      sunMinutes: r.sunMinutes || 0, bath: r.bath || '',
      notes: r.notes || '', photos: r.photos || [],
      savedAt: S.fmtTime(Date.now())
    };
    // 同步最新体重到爱鸟档案
    if (r.weight) {
      const p = st.pets.find(x => x.id === pet.id);
      if (p) p.weight = r.weight;
    }
    st.recordDays = Object.keys(st.records[pet.id]).length;
    S.saveState();
    wx.showToast({ title: '记录已保存', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  cancel() { wx.navigateBack(); }
});
