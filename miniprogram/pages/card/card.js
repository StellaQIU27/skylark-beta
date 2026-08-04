/* 雀跃 — 鸟宝日记卡片
   把某一天的记录画成一张竖版图，可保存相册 / 转发好友 / 分享到朋友圈。
   画布逻辑宽度固定 750，高度按内容自适应，再按设备 dpr 放大绘制。 */

const S = require('../../utils/store.js');

/* ---------- 设计令牌（与 app.wxss 一致） ---------- */
const C = {
  cream: '#F5EDDE', creamWarm: '#FBF6EA', paper: '#FDFAF2', paperDark: '#EDE1C8',
  beige: '#E8DCC4', sage: '#8BA88B', sageTint: '#E4EBDA', sageSoft: '#C6D3B8',
  sageDark: '#6B7A4C', sageDarker: '#4E5A35', terracotta: '#D9896B', terraSoft: '#F5C9B8',
  ink: '#3A3E2F', inkSoft: '#6F715D', inkMute: '#8C8973', white: '#FFFFFF'
};
const FONT = '"PingFang SC","Noto Sans SC",-apple-system,sans-serif';
const W = 750;
const CARD_X = 36, CARD_W = W - CARD_X * 2, PAD = 40;
const IN_X = CARD_X + PAD, IN_W = CARD_W - PAD * 2;

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const BATH = { active: '主动洗', spray: '喷水洗', none: '未洗澡' };

/* ---------- 小工具 ---------- */
function parseISO(iso) { const a = iso.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysBefore(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() - n); return isoOf(d); }

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
// 只圆上面两个角（照片贴着卡片顶部时用）
function rrTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx, size, weight) {
  ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
}

// 按宽度断行（中英混排逐字测量）
function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  let line = '';
  const src = String(text).replace(/\r/g, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') { out.push(line); line = ''; if (out.length >= maxLines) break; continue; }
    const t = line + ch;
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line); line = ch;
      if (out.length >= maxLines) break;
    } else line = t;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && line && out[maxLines - 1] !== line) {
    let last = out[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = last + '…';
  }
  return out;
}

function loadImg(canvas, src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const go = p => {
      const img = canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = p;
    };
    if (src.indexOf('cloud://') === 0) {
      wx.cloud.downloadFile({ fileID: src })
        .then(r => go(r.tempFilePath))
        .catch(() => resolve(null));
    } else if (/^https?:\/\//.test(src)) {
      wx.getImageInfo({ src, success: r => go(r.path), fail: () => resolve(null) });
    } else go(src);
  });
}

// aspectFill：居中裁切铺满
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let sw, sh, sx, sy;
  if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/* ================================================================= */
Page({
  data: {
    petId: null, date: '', dates: [], img: '', busy: true,
    cw: W / 2, ch: 600, shareTitle: ''
  },

  onLoad(opt) {
    const st = S.getState();
    const petId = opt.pet || st.activePetId || ((st.pets || [])[0] || {}).id;
    const recs = (st.records || {})[petId] || {};
    const all = Object.keys(recs).sort().reverse();
    if (!all.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 700);
      return;
    }
    const today = S.todayISO();
    const dates = all.slice(0, 14).map(iso => {
      const d = parseISO(iso);
      return {
        iso,
        label: iso === today ? '今天'
             : iso === daysBefore(today, 1) ? '昨天'
             : (d.getMonth() + 1) + '/' + d.getDate()
      };
    });
    const date = (opt.date && recs[opt.date]) ? opt.date : all[0];
    this.setData({ petId, date, dates });
  },

  onReady() { this.build(); },

  pickDate(e) {
    const iso = e.currentTarget.dataset.iso;
    if (iso === this.data.date) return;
    this.setData({ date: iso, img: '', busy: true }, () => this.build());
  },

  /* ---------------- 组装数据 ---------------- */
  collect() {
    const st = S.getState();
    const pet = (st.pets || []).find(p => p.id === this.data.petId) || {};
    const recs = (st.records || {})[this.data.petId] || {};
    const iso = this.data.date;
    const rec = recs[iso] || {};
    const d = parseISO(iso);

    // 近 14 天里有体重的点，最多取 7 个
    const pts = [];
    for (let i = 13; i >= 0; i--) {
      const k = daysBefore(iso, i);
      const w = (recs[k] || {}).weight;
      if (w) pts.push({ iso: k, w: w, d: parseISO(k) });
    }
    const trend = pts.slice(-7);

    let delta = null;
    const prevPt = trend.length > 1 && trend[trend.length - 1].iso === iso ? trend[trend.length - 2] : null;
    if (prevPt && rec.weight) delta = rec.weight - prevPt.w;

    const foods = [];
    (rec.feedings || []).forEach(f => (f.foods || []).forEach(x => { if (foods.indexOf(x) < 0) foods.push(x); }));

    return {
      pet, rec, iso, trend, delta, foods,
      dateText: (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WD[d.getDay()],
      yearText: d.getFullYear() + '',
      totalDays: Object.keys(recs).length,
      photo: (rec.photos || [])[0] || null,
      avatar: S.avatarSrc(pet)
    };
  },

  /* ---------------- 绘制 ---------------- */
  async build() {
    const D = this.collect();
    if (!D) return;
    this.setData({ busy: true, shareTitle: (D.pet.name || '鸟宝') + '的' + D.dateText.split(' · ')[0] + '日记' });

    const q = wx.createSelectorQuery().in(this);
    q.select('#cardCanvas').fields({ node: true, size: true }).exec(async res => {
      if (!res || !res[0] || !res[0].node) { this.setData({ busy: false }); return; }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');

      // 先加载图片，才能确定 hero 高度
      const [hero, avatar, logo] = await Promise.all([
        loadImg(canvas, D.photo),
        loadImg(canvas, D.avatar),
        loadImg(canvas, '/images/skylark-logo.png')
      ]);

      const L = this.layout(ctx, D, !!hero);
      const dpr = Math.min(wx.getSystemInfoSync().pixelRatio || 2, 3);
      canvas.width = W * dpr;
      canvas.height = L.H * dpr;
      this.setData({ cw: W / 2, ch: L.H / 2 });
      ctx.scale(dpr, dpr);

      this.paint(ctx, D, L, { hero, avatar, logo });

      wx.canvasToTempFilePath({
        canvas, x: 0, y: 0, width: W * dpr, height: L.H * dpr,
        destWidth: W * dpr, destHeight: L.H * dpr,
        success: r => this.setData({ img: r.tempFilePath, busy: false }),
        fail: () => { this.setData({ busy: false }); wx.showToast({ title: '生成失败，请重试', icon: 'none' }); }
      }, this);
    });
  },

  // 先算高度：所有需要换行的文本在这里量好
  layout(ctx, D, hasHero) {
    const heroH = hasHero ? 500 : 320;
    let y = CARD_X + heroH + 44;          // 卡片从 CARD_X 开始，hero 贴顶

    y += 30;            // 日期行
    y += 22;
    y += 54;            // 名字行
    y += 14;
    y += 30;            // 品种 · 年龄
    y += 38;

    const statsY = y;
    y += 138 + 32;      // 四格数据

    let trendY = 0, trendH = 0;
    if (D.trend.length >= 2) { trendY = y; trendH = 230; y += trendH + 32; }

    let notesY = 0, noteLines = [];
    if ((D.rec.notes || '').trim()) {
      setFont(ctx, 27, 400);
      noteLines = wrap(ctx, D.rec.notes.trim(), IN_W - 56, 4);
      notesY = y;
      y += 34 + noteLines.length * 42 + 30 + 26;
    }

    let foodY = 0;
    if (D.foods.length) { foodY = y; y += 46 + 26; }

    const footY = y + 6;
    y = footY + 84;

    return { H: Math.round(y + CARD_X), heroH, statsY, trendY, trendH, notesY, noteLines, foodY, footY };
  },

  paint(ctx, D, L, imgs) {
    const H = L.H;

    /* 背景：米色渐变 + 顶部一抹鼠尾草 */
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#F3EBD9');
    bg.addColorStop(0.55, '#F0EDE0');
    bg.addColorStop(1, '#E9EEDE');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 主卡片 */
    const cardY = CARD_X, cardH = H - CARD_X * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(58,62,47,0.13)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = C.paper;
    rr(ctx, CARD_X, cardY, CARD_W, cardH, 44);
    ctx.fill();
    ctx.restore();

    /* ---- Hero ---- */
    ctx.save();
    rrTop(ctx, CARD_X, cardY, CARD_W, L.heroH, 44);
    ctx.clip();
    if (imgs.hero) {
      drawCover(ctx, imgs.hero, CARD_X, cardY, CARD_W, L.heroH);
      // 底部一点渐隐，和纸面衔接
      const g = ctx.createLinearGradient(0, cardY + L.heroH - 90, 0, cardY + L.heroH);
      g.addColorStop(0, 'rgba(253,250,242,0)');
      g.addColorStop(1, 'rgba(253,250,242,0.92)');
      ctx.fillStyle = g;
      ctx.fillRect(CARD_X, cardY + L.heroH - 90, CARD_W, 90);
    } else {
      const g = ctx.createLinearGradient(CARD_X, cardY, CARD_X + CARD_W, cardY + L.heroH);
      g.addColorStop(0, '#EAF0DF');
      g.addColorStop(1, '#F3ECDC');
      ctx.fillStyle = g;
      ctx.fillRect(CARD_X, cardY, CARD_W, L.heroH);
      if (imgs.avatar) {
        const s = 190, cx = W / 2, cy = cardY + L.heroH / 2 - 6;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, s / 2 + 16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); ctx.clip();
        drawCover(ctx, imgs.avatar, cx - s / 2, cy - s / 2, s, s);
        ctx.restore();
      }
    }
    ctx.restore();

    /* Hero 右上角：年份徽标 */
    ctx.save();
    setFont(ctx, 22, 600);
    const yw = ctx.measureText(D.yearText).width + 40;
    ctx.fillStyle = imgs.hero ? 'rgba(58,62,47,.55)' : 'rgba(255,255,255,.75)';
    rr(ctx, CARD_X + CARD_W - yw - 26, cardY + 26, yw, 44, 22);
    ctx.fill();
    ctx.fillStyle = imgs.hero ? '#fff' : C.sageDark;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(D.yearText, CARD_X + CARD_W - yw / 2 - 26, cardY + 48);
    ctx.restore();

    let y = cardY + L.heroH + 44;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    /* ---- 日期 + 第 N 天 ---- */
    setFont(ctx, 25, 700);
    ctx.fillStyle = C.sageDark;
    ctx.fillText(D.dateText, IN_X, y);
    setFont(ctx, 23, 400);
    ctx.fillStyle = C.inkMute;
    ctx.textAlign = 'right';
    ctx.fillText('第 ' + D.totalDays + ' 天记录', IN_X + IN_W, y + 2);
    ctx.textAlign = 'left';
    y += 30 + 22;

    /* ---- 名字 ---- */
    setFont(ctx, 50, 700);
    ctx.fillStyle = C.ink;
    const name = D.pet.name || '我的鸟宝';
    ctx.fillText(name, IN_X, y);
    y += 54 + 14;

    /* ---- 品种 · 年龄 ---- */
    setFont(ctx, 25, 400);
    ctx.fillStyle = C.inkSoft;
    const sub = [D.pet.species, D.pet.gender === 'f' ? '♀' : D.pet.gender === 'm' ? '♂' : ''].filter(Boolean).join('  ');
    ctx.fillText(sub, IN_X, y + 2);
    y += 30 + 38;

    /* ---- 四格数据 ---- */
    const gap = 16, bw = (IN_W - gap * 3) / 4, bh = 138;
    const cells = [
      { v: D.rec.weight ? D.rec.weight.toFixed(1) : '—', u: D.rec.weight ? 'g' : '', l: '体重',
        d: D.delta ? (D.delta > 0 ? '+' : '−') + Math.abs(D.delta).toFixed(1) : '' },
      { v: (D.rec.feedings || []).length || '—', u: (D.rec.feedings || []).length ? '次' : '', l: '喂食' },
      { v: D.rec.sunMinutes || '—', u: D.rec.sunMinutes ? '分' : '', l: '日照' },
      { v: D.rec.bath ? (BATH[D.rec.bath] || '—') : '—', u: '', l: '洗澡', small: true }
    ];
    cells.forEach((c, i) => {
      const x = IN_X + i * (bw + gap);
      ctx.fillStyle = i === 0 ? C.sageTint : C.creamWarm;
      rr(ctx, x, L.statsY, bw, bh, 26);
      ctx.fill();
      if (i !== 0) { ctx.strokeStyle = C.beige; ctx.lineWidth = 2; ctx.stroke(); }

      ctx.textAlign = 'center';
      const cx = x + bw / 2;
      const vs = c.small ? 27 : 38;
      setFont(ctx, vs, 700);
      ctx.fillStyle = i === 0 ? C.sageDarker : C.ink;
      const vTxt = String(c.v);
      const vw = ctx.measureText(vTxt).width;
      let uw = 0;
      if (c.u) { setFont(ctx, 21, 600); uw = ctx.measureText(c.u).width + 3; }
      setFont(ctx, vs, 700);
      const startX = cx - (vw + uw) / 2;
      ctx.textAlign = 'left';
      ctx.fillText(vTxt, startX, L.statsY + (c.small ? 44 : 36));
      if (c.u) {
        setFont(ctx, 21, 600);
        ctx.fillStyle = C.inkMute;
        ctx.fillText(c.u, startX + vw + 3, L.statsY + (c.small ? 52 : 50));
      }

      ctx.textAlign = 'center';
      setFont(ctx, 22, 400);
      ctx.fillStyle = C.inkMute;
      ctx.fillText(c.l, cx, L.statsY + 92);

      if (c.d) {
        setFont(ctx, 20, 600);
        ctx.fillStyle = c.d[0] === '−' ? C.terracotta : C.sageDark;
        ctx.fillText(c.d + 'g', cx, L.statsY + 116);
      }
      ctx.textAlign = 'left';
    });

    /* ---- 体重走势 ---- */
    if (L.trendY) this.paintTrend(ctx, D, L);

    /* ---- 备注 ---- */
    if (L.notesY) {
      const nh = 34 + L.noteLines.length * 42 + 30;
      ctx.fillStyle = C.creamWarm;
      rr(ctx, IN_X, L.notesY, IN_W, nh, 26);
      ctx.fill();
      // 左侧一条鼠尾草色引导线
      ctx.fillStyle = C.sageSoft;
      rr(ctx, IN_X, L.notesY + 22, 6, nh - 44, 3);
      ctx.fill();

      setFont(ctx, 27, 400);
      ctx.fillStyle = C.inkSoft;
      L.noteLines.forEach((ln, i) => {
        ctx.fillText(ln, IN_X + 28, L.notesY + 30 + i * 42);
      });
    }

    /* ---- 今日食物 ---- */
    if (L.foodY) {
      let x = IN_X;
      setFont(ctx, 22, 500);
      D.foods.slice(0, 6).forEach(f => {
        const tw = ctx.measureText(f).width + 34;
        if (x + tw > IN_X + IN_W) return;
        ctx.fillStyle = C.sageTint;
        rr(ctx, x, L.foodY, tw, 42, 21);
        ctx.fill();
        ctx.fillStyle = C.sageDark;
        ctx.textAlign = 'center';
        ctx.fillText(f, x + tw / 2, L.foodY + 11);
        ctx.textAlign = 'left';
        x += tw + 12;
      });
    }

    /* ---- 页脚 ---- */
    ctx.strokeStyle = C.beige;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(IN_X, L.footY);
    ctx.lineTo(IN_X + IN_W, L.footY);
    ctx.stroke();

    const fy = L.footY + 26;
    if (imgs.logo) {
      ctx.save();
      ctx.beginPath(); ctx.arc(IN_X + 24, fy + 24, 24, 0, Math.PI * 2); ctx.clip();
      drawCover(ctx, imgs.logo, IN_X, fy, 48, 48);
      ctx.restore();
    }
    setFont(ctx, 25, 700);
    ctx.fillStyle = C.ink;
    ctx.fillText('雀跃', IN_X + 62, fy + 2);
    setFont(ctx, 21, 400);
    ctx.fillStyle = C.inkMute;
    ctx.fillText('鸟宝养护记录', IN_X + 62, fy + 30);

    ctx.textAlign = 'right';
    setFont(ctx, 21, 400);
    ctx.fillStyle = C.inkMute;
    ctx.fillText('微信搜索小程序「雀跃」', IN_X + IN_W, fy + 16);
    ctx.textAlign = 'left';
  },

  paintTrend(ctx, D, L) {
    const x0 = IN_X, y0 = L.trendY, w = IN_W, h = L.trendH;
    ctx.fillStyle = C.creamWarm;
    rr(ctx, x0, y0, w, h, 28);
    ctx.fill();
    ctx.strokeStyle = C.beige; ctx.lineWidth = 2; ctx.stroke();

    setFont(ctx, 22, 700);
    ctx.fillStyle = C.sageDark;
    ctx.textAlign = 'left';
    ctx.fillText('体重走势', x0 + 28, y0 + 24);

    const ws = D.trend.map(p => p.w);
    const hi = Math.max.apply(null, ws), lo = Math.min.apply(null, ws);
    setFont(ctx, 20, 400);
    ctx.fillStyle = C.inkMute;
    ctx.textAlign = 'right';
    ctx.fillText(lo.toFixed(1) + ' – ' + hi.toFixed(1) + ' g', x0 + w - 28, y0 + 26);
    ctx.textAlign = 'left';

    // 绘图区
    const px = x0 + 40, pw = w - 80;
    const py = y0 + 74, ph = h - 74 - 46;
    const span = Math.max(0.6, hi - lo);
    const n = D.trend.length;
    const xs = i => n === 1 ? px + pw / 2 : px + (pw * i) / (n - 1);
    const ys = v => py + ph - ((v - lo) / span) * ph;

    // 面积
    ctx.beginPath();
    ctx.moveTo(xs(0), ys(ws[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xs(i), ys(ws[i]));
    ctx.lineTo(xs(n - 1), py + ph);
    ctx.lineTo(xs(0), py + ph);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(139,168,139,0.34)');
    g.addColorStop(1, 'rgba(139,168,139,0.02)');
    ctx.fillStyle = g;
    ctx.fill();

    // 折线
    ctx.beginPath();
    ctx.moveTo(xs(0), ys(ws[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xs(i), ys(ws[i]));
    ctx.strokeStyle = C.sageDark;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 点 + 日期
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      ctx.beginPath();
      ctx.arc(xs(i), ys(ws[i]), isLast ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isLast ? C.terracotta : C.paper;
      ctx.fill();
      ctx.strokeStyle = isLast ? C.terracotta : C.sageDark;
      ctx.lineWidth = 3;
      ctx.stroke();

      setFont(ctx, 19, isLast ? 700 : 400);
      ctx.fillStyle = isLast ? C.ink : C.inkMute;
      const d = D.trend[i].d;
      ctx.fillText((d.getMonth() + 1) + '/' + d.getDate(), xs(i), py + ph + 16);
    }
    // 最新值标注
    setFont(ctx, 21, 700);
    ctx.fillStyle = C.terracotta;
    ctx.fillText(ws[n - 1].toFixed(1), xs(n - 1), ys(ws[n - 1]) - 34);
    ctx.textAlign = 'left';
  },

  /* ---------------- 导出 ---------------- */
  previewBig() {
    if (!this.data.img) return;
    wx.previewImage({ urls: [this.data.img] });
  },

  saveAlbum() {
    if (!this.data.img || this.data.busy) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.img,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: err => {
        if ((err.errMsg || '').indexOf('auth deny') >= 0 || (err.errMsg || '').indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置里打开「保存到相册」权限',
            confirmText: '去设置',
            success: r => { if (r.confirm) wx.openSetting(); }
          });
        } else wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  toMoments() {
    if (!this.data.img || this.data.busy) return;
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: this.data.img,
        fail: () => wx.showToast({ title: '已取消', icon: 'none' })
      });
    } else {
      wx.previewImage({ urls: [this.data.img] });
      wx.showToast({ title: '长按图片可分享', icon: 'none' });
    }
  },

  onShareAppMessage() {
    return {
      title: this.data.shareTitle || '我家鸟宝的日记',
      path: '/pages/home/home',
      imageUrl: this.data.img || ''
    };
  },

  onShareTimeline() {
    return {
      title: this.data.shareTitle || '我家鸟宝的日记',
      imageUrl: this.data.img || ''
    };
  }
});
