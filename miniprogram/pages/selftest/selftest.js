const COLS = ['posts','comments','post_likes','follows','notifications','circle_members','pets','feedback','events'];
const FNS = ['login','track','checkContent','analytics'];

Page({
  data: {
    envOk:false, envMsg:'检测中…', openidOk:false, openidMsg:'检测中…',
    openid:'', isDevtool:false, isAdmin:false,
    cols:[], okCount:0, total:COLS.length,
    fns:[], fnOk:0, fnTotal:FNS.length,
    errs:[], done:false
  },
  onLoad() { this.run(); },
  copyOpenid() {
    wx.setClipboardData({ data: this.data.openid,
      success: () => wx.showToast({ title: '已复制 openid', icon: 'none' }) });
  },

  async run() {
    this.setData({
      errs:[], done:false,
      cols: COLS.map(n=>({name:n, ok:false, msg:'…'})),
      fns: FNS.map(n=>({name:n, ok:false, msg:'…'}))
    });
    const errs = [];

    // 1. 云环境
    try {
      this.setData({ envOk:true, envMsg: getApp().globalData.env });
    } catch(e) {
      this.setData({ envOk:false, envMsg:'未初始化' });
      errs.push('云开发未初始化');
    }

    // 2. openid
    await getApp().waitReady();
    const oid = getApp().globalData.openid || '';
    let isDevtool = false;
    try { isDevtool = (wx.getSystemInfoSync()||{}).platform === 'devtools'; } catch(e) {}
    if (oid && oid.indexOf('local_') !== 0) {
      this.setData({ openidOk:true, openidMsg:'已识别', openid:oid, isDevtool });
    } else {
      this.setData({ openidOk:false, openidMsg:'云函数 login 未部署', openid:oid, isDevtool });
      errs.push('云函数 login 未部署');
    }

    // 3. 云函数
    const fns = [];
    let fok = 0;
    for (const name of FNS) {
      let r = { name, ok:false, msg:'' };
      try {
        if (name === 'login') {
          r.ok = this.data.openidOk; r.msg = r.ok ? '正常' : '未部署';
        } else if (name === 'track') {
          await wx.cloud.callFunction({ name:'track', data:{ name:'selftest', props:{} } });
          r.ok = true; r.msg = '正常';
        } else if (name === 'checkContent') {
          const res = await wx.cloud.callFunction({ name:'checkContent', data:{ text:'这是一条测试内容', scene:2 } });
          const rr = res.result || {};
          if (rr.warn === 'text_check_failed') { r.ok = true; r.msg = '已部署（接口未开通）'; }
          else { r.ok = true; r.msg = '正常'; }
        } else if (name === 'analytics') {
          const res = await wx.cloud.callFunction({ name:'analytics' });
          const rr = res.result || {};
          if (rr.error) { r.ok = true; r.msg = '正常（你非管理员）'; }
          else { r.ok = true; r.msg = '正常（管理员）'; this.setData({ isAdmin:true }); }
        }
        if (r.ok) fok++;
      } catch (e) {
        const m = (e && e.errMsg) || String(e);
        if (m.indexOf('not found') >= 0 || m.indexOf('FunctionName') >= 0 || m.indexOf('-501000') >= 0) {
          r.msg = '未部署';
          errs.push(`云函数 ${name} 未部署：右键 cloudfunctions/${name} → 上传并部署`);
        } else {
          r.msg = '调用失败';
          errs.push(`云函数 ${name}：${m}`);
        }
      }
      fns.push(r);
      this.setData({ fns, fnOk: fok });
    }

    // 4. 数据库集合
    const db = wx.cloud.database();
    const cols = [];
    let ok = 0;
    for (const name of COLS) {
      let r = { name, ok:false, msg:'' };
      try {
        await db.collection(name).limit(1).get();
        r.ok = true; r.msg = '正常'; ok++;
      } catch (e) {
        const m = (e && e.errMsg) || String(e);
        if (m.indexOf('not exist') >= 0) {
          r.msg = '集合不存在';
          errs.push(`集合 ${name} 未创建`);
        } else if (m.indexOf('permission') >= 0 || m.indexOf('denied') >= 0) {
          r.msg = '权限不足';
          errs.push(`集合 ${name} 权限需调整`);
        } else { r.msg = '读取失败'; errs.push(`集合 ${name}：${m}`); }
      }
      cols.push(r);
      this.setData({ cols, okCount: ok });
    }

    this.setData({ errs, done:true });
  }
});
