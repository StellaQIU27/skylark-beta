// 云函数：contrib —— 鸟种图鉴投稿的管理端
// 普通用户投稿直接写 bird_contrib（仅创建者可读）；这里给管理员做列出 / 采纳 / 驳回。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ADMINS = ['obfhL3fhV1pnZlo9QyYZwPzD2i4M'];

exports.main = async event => {
  const OPENID = cloud.getWXContext().OPENID;
  if (ADMINS.indexOf(OPENID) < 0) return { ok: false, msg: '无权限' };

  const action = event.action || 'list';

  /* 列出投稿 */
  if (action === 'list') {
    const status = event.status || 'pending';
    const { data } = await db.collection('bird_contrib')
      .where(status === 'all' ? {} : { status })
      .orderBy('createdAt', 'desc').limit(60).get();
    const counts = {};
    for (const s of ['pending', 'accepted', 'rejected']) {
      try {
        const r = await db.collection('bird_contrib').where({ status: s }).count();
        counts[s] = r.total;
      } catch (e) { counts[s] = 0; }
    }
    return { ok: true, list: data || [], counts };
  }

  /* 采纳 */
  if (action === 'accept') {
    const { data } = await db.collection('bird_contrib').doc(event.id).get();
    if (!data) return { ok: false, msg: '投稿不存在' };

    // 照片类投稿：写入 bird_photos，图鉴前台读这张表
    if (data.type === 'photo' && data.photo) {
      // 同一鸟种只保留最新一张采纳图
      const old = await db.collection('bird_photos').where({ birdId: data.birdId }).get();
      for (const o of (old.data || [])) {
        await db.collection('bird_photos').doc(o._id).remove();
      }
      await db.collection('bird_photos').add({
        data: {
          birdId: data.birdId,
          birdName: data.birdName || '',
          fileID: data.photo,
          contributor: data.nickname || '鸟友',
          contributorId: data._openid,
          place: data.place || '',
          shotAt: data.shotAt || '',
          contribId: event.id,
          createdAt: Date.now()
        }
      });
    }

    await db.collection('bird_contrib').doc(event.id).update({
      data: { status: 'accepted', reviewedAt: Date.now(), note: event.note || '' }
    });
    return { ok: true };
  }

  /* 驳回 */
  if (action === 'reject') {
    await db.collection('bird_contrib').doc(event.id).update({
      data: { status: 'rejected', reviewedAt: Date.now(), note: event.note || '' }
    });
    return { ok: true };
  }

  /* 撤下已采纳的图 */
  if (action === 'revoke') {
    const r = await db.collection('bird_photos').where({ contribId: event.id }).get();
    for (const o of (r.data || [])) await db.collection('bird_photos').doc(o._id).remove();
    await db.collection('bird_contrib').doc(event.id).update({
      data: { status: 'pending', reviewedAt: Date.now() }
    });
    return { ok: true };
  }

  return { ok: false, msg: '未知操作' };
};
