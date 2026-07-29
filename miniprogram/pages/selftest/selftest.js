const COLS = ['posts','comments','post_likes','follows','notifications','circle_members','pets','feedback'];
Page({
  data: { envOk:false, envMsg:'检测中…', openidOk:false, openidMsg:'检测中…',
          cols:[], okCount:0, total:COLS.length, errs:[], done:false },
  onLoad() { this.run(); },
  async run() {
    this.setData({ errs:[], done:false, cols: COLS.map(n=>({name:n, ok:false, msg:'检测中…'})) });
    const errs = [];

    // 1. 云环境
    try {
      const env = getApp().globalData.env;
      this.setData({ envOk:true, envMsg: env });
    } catch(e) {
      this.setData({ envOk:false, envMsg:'未初始化' });
      errs.push('云开发未初始化');
    }

    // 2. openid（云函数 login）
    await getApp().waitReady();
    const oid = getApp().globalData.openid || '';
    if (oid && oid.indexOf('local_') !== 0) {
      this.setData({ openidOk:true, openidMsg: oid.slice(0,10)+'…' });
    } else {
      this.setData({ openidOk:false, openidMsg:'云函数未部署（使用临时ID）' });
      errs.push('云函数 login 未部署：右键 cloudfunctions/login → 上传并部署');
    }

    // 3. 逐个集合读写测试
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
        if (m.indexOf('collection not exists') >= 0 || m.indexOf('not exist') >= 0) {
          r.msg = '集合不存在';
          errs.push(`集合 ${name} 未创建`);
        } else if (m.indexOf('permission') >= 0 || m.indexOf('denied') >= 0) {
          r.msg = '权限不足';
          errs.push(`集合 ${name} 权限需改为「所有用户可读，仅创建者可读写」`);
        } else {
          r.msg = '读取失败';
          errs.push(`集合 ${name}：${m}`);
        }
      }
      cols.push(r);
      this.setData({ cols, okCount: ok });
    }
    this.setData({ errs, done:true });
  }
});
