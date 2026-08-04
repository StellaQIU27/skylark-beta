/* 雀跃 — 功能开关
 *
 * COMMUNITY：社区（动态、圈子、发帖、评论、关注、通知）总开关。
 *
 *   false = 「记录版」。微信规定 UGC 内容发布/交流必须选择「社交-社区/论坛」
 *           服务类目，而该类目对个人主体不开放。上线审核期间关掉，
 *           小程序只保留爱鸟档案、喂养记录、鸟种图鉴，属于工具/生活服务类目。
 *   true  = 完整版。主体升级为个体工商户/企业并拿到社交类目后，
 *           把下面改成 true、同步 app.json 的 tabBar（见文件末尾说明）即可全部恢复。
 *
 * ── 改回 true 时，还要做两件事 ──
 *
 * 1) app.json 的 tabBar 恢复成 4 个（在「记录」和「我的」之间插回）：
 *    { "pagePath": "pages/community/community", "text": "社区",
 *      "iconPath": "images/tab-community.png",
 *      "selectedIconPath": "images/tab-community-on.png" }
 *
 * 2) sitemap.json 改回 [{ "action": "allow", "page": "*" }]
 *
 * 其余全部由本开关自动生效，不需要动别的代码。以下位置读取了本开关：
 *   pages/home（动态流/发帖/铃铛/slogan/社区卡片）、pages/profile（粉丝、赞、动态、收藏、草稿）、
 *   pages/settings（通知/拉黑/社区规范）、pages/search（帖子与鸟友结果）、
 *   pages/terms（社区规范 tab 与协议正文措辞）、pages/help（社区相关 FAQ）、
 *   pages/editor（mode=post 拦截），以及 11 个社区页各自的 __commGuard()：
 *   community / circle / post / notifications / user / myposts /
 *   favorites / drafts / followers / following / likes
 */
const FEATURES = {
  COMMUNITY: false
};

module.exports = FEATURES;
