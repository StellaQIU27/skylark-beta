// 云函数：内容安全检测（文本 + 图片）
// 使用微信官方 security.msgSecCheck / imgSecCheck
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { text, fileID, scene } = event;
  const openid = cloud.getWXContext().OPENID;

  // ---------- 文本检测 ----------
  if (text && text.trim()) {
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        version: 2,
        openid,
        scene: scene || 2,          // 1资料 2评论 3论坛 4社交日志
        content: text.slice(0, 2500)
      });
      // suggest: pass / review / risky
      const suggest = (res.result && res.result.suggest) || 'pass';
      const label = (res.result && res.result.label) || 0;
      if (suggest === 'risky') {
        return { pass: false, reason: labelText(label), suggest, label };
      }
      if (suggest === 'review') {
        return { pass: false, reason: '内容可能不合适，请修改后再试', suggest, label };
      }
    } catch (e) {
      // 接口异常时不阻断发布，但记录下来
      console.error('msgSecCheck error', e);
      return { pass: true, warn: 'text_check_failed' };
    }
  }

  // ---------- 图片检测 ----------
  if (fileID) {
    try {
      const dl = await cloud.downloadFile({ fileID });
      const res = await cloud.openapi.security.imgSecCheck({
        media: { contentType: 'image/png', value: dl.fileContent }
      });
      if (res.errCode !== 0) {
        return { pass: false, reason: '图片可能含有不适宜内容' };
      }
    } catch (e) {
      const code = e && (e.errCode || (e.data && e.data.errCode));
      if (code === 87014) return { pass: false, reason: '图片可能含有不适宜内容' };
      console.error('imgSecCheck error', e);
      return { pass: true, warn: 'img_check_failed' };
    }
  }

  return { pass: true };
};

function labelText(label) {
  const map = {
    100: '正常', 10001: '含有广告内容', 20001: '含有时政敏感内容',
    20002: '含有色情内容', 20003: '含有辱骂内容', 20006: '含有违法犯罪内容',
    20008: '含有欺诈内容', 20012: '含有低俗内容', 20013: '含有版权风险内容',
    21000: '内容不合规'
  };
  return (map[label] || '内容不合规') + '，请修改后再发布';
}
