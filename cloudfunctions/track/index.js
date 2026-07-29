// 云函数：行为埋点（写入 events 集合）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { name, props } = event;
  const wx = cloud.getWXContext();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  try {
    await db.collection('events').add({
      data: {
        name,                       // 事件名
        props: props || {},         // 附加属性
        openid: wx.OPENID,          // 用户
        day,                        // 便于按天聚合
        ts: Date.now()
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
};
