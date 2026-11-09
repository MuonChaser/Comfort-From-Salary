(function () {
  const $ = id => document.getElementById(id);
  let paused = false;
  const working = document.body.dataset.animation === 'working';
  const lunch = document.body.dataset.animation === 'lunch';
  const after = document.body.dataset.animation === 'after';
  const rest = document.body.dataset.animation === 'rest';
  function phaseText(phase) {
    if (rest) {
      $('scene-badge').textContent = phase === 'action' ? '偶发动作 · 落日合影' : '常驻循环 · 墨镜出游';
      $('scene-caption').textContent = phase === 'action' ? '举起相机，海面和落日升起，比耶按下快门' : '常驻循环 · 戴着墨镜，开心地轻轻晃动';
      return;
    }
    if (after) {
      $('scene-badge').textContent = phase === 'action' ? '偶发动作 · 翻身摔下沙发' : '常驻循环 · 沙发放空';
      $('scene-caption').textContent = phase === 'action' ? '翻身滑落 → 摔下沙发 → 撑起身爬回去 → 继续躺' : '常驻循环：靠着沙发扶手，放空休息';
      return;
    }
    if (lunch) {
      $('scene-badge').textContent = phase === 'action' ? '偶发动作 · 大口吃饭' : '常驻循环 · 满足待餐';
      $('scene-caption').textContent = phase === 'action' ? '大口吃饭 → 鼓腮咀嚼 → 吃空餐盒 → 满足地打饱嗝' : '常驻循环：开心地拿着刀叉，准备享用午饭';
      return;
    }
    if (working) {
      $('scene-badge').textContent = phase === 'action' ? '偶发动作 · 红温砸桌' : '常驻循环 · 烦躁工作';
      $('scene-caption').textContent = phase === 'action' ? '红温加深 → 握拳抬手 → 砸桌一次 → 缓缓平复' : '常驻循环：皱眉敲键盘，生气符号轻轻跳动';
      return;
    }
    $('scene-badge').textContent = phase === 'action' ? '偶发动作 · 打盹后惊醒' : '常驻循环 · 疲惫通勤';
    $('scene-caption').textContent = phase === 'action' ? '打盹 → 失衡 → 重新抓稳扶手 → 松一口气' : '常驻循环：疲惫站立、轻微呼吸与晃动';
  }
  const assets = {
    rest: window.CFSYueyaRestAssets,
    after: window.CFSYueyaAfterAssets,
    lunch: window.CFSYueyaLunchAssets,
    working: window.CFSYueyaWorkingAssets,
  }[document.body.dataset.animation] || window.CFSYueyaAssets;
  const player = new window.CFSCommuterPlayer($('preview-sprite'), { assets, onPhase: phaseText, onReady: ok => {
    $('play-action').disabled = !ok || player.reduced;
    $('pause-animation').disabled = !ok;
    if (!ok) { $('scene-badge').textContent = '素材加载失败'; $('scene-caption').textContent = '请保持页面与 assets 文件夹的相对位置不变。'; }
  } });
  $('reduce-motion').checked = player.reduced;
  player.setActive(!document.hidden);
  $('play-action').addEventListener('click', () => {
    paused = false; player.setActive(true); $('pause-animation').textContent = '暂停'; player.playAction();
  });
  $('pause-animation').addEventListener('click', () => {
    paused = !paused; player.setActive(!paused && !document.hidden); $('pause-animation').textContent = paused ? '继续播放' : '暂停';
    if (paused) $('scene-badge').textContent = '动画已暂停';
  });
  $('toggle-background').addEventListener('click', () => {
    const dark = $('animation-stage').classList.toggle('dark');
    $('toggle-background').textContent = dark ? '切换浅色背景' : '切换深色背景';
    $('toggle-background').setAttribute('aria-pressed', String(dark));
  });
  $('reduce-motion').addEventListener('change', event => {
    player.setReduced(event.target.checked); $('play-action').disabled = event.target.checked || !player.loaded;
    if (event.target.checked) { $('scene-badge').textContent = '减少动画 · 静态姿势'; $('scene-caption').textContent = '关闭“减少动画”即可继续查看动作。'; }
  });
  document.addEventListener('visibilitychange', () => player.setActive(!document.hidden && !paused));
})();
