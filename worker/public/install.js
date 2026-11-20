(() => {
  'use strict';
  let pending = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const banner = document.getElementById('install-banner');
  const button = document.getElementById('install-action');
  const dialog = document.getElementById('install-guide');
  function render() {
    let dismissed = false;
    try { dismissed = Date.now() - Number(localStorage.getItem('bbc-install-dismissed') || 0) < 7 * 86400000; } catch {}
    banner.classList.toggle('hidden', standalone() || dismissed);
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); pending = e; render();
  });
  window.addEventListener('appinstalled', () => { pending = null; banner.classList.add('hidden'); });
  matchMedia('(display-mode: standalone)').addEventListener('change', render);
  document.getElementById('install-close').onclick = () => {
    banner.classList.add('hidden');
    try { localStorage.setItem('bbc-install-dismissed', String(Date.now())); } catch {}
  };
  button.onclick = async () => {
    if (pending) {
      const event = pending; pending = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') banner.classList.add('hidden');
      } catch { instructions(); }
    } else instructions();
  };
  function instructions() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let text;
    if (ios) text = '在 Safari 中打开本站，点击“分享”按钮，再选择“添加到主屏幕”，最后点击“添加”。如果菜单里没有此选项，请先切换到 Safari。';
    else if (/Android/.test(ua)) text = '打开浏览器右上角菜单（⋮），选择“安装应用”或“添加到主屏幕”。若当前浏览器没有此选项，请用 Chrome 或 Edge 打开本站。';
    else text = '点击浏览器地址栏中的安装图标，或打开 Chrome / Edge 菜单，选择“安装此网站为应用”。如果浏览器不支持安装，也可以创建桌面快捷方式。';
    document.getElementById('install-instructions').textContent = text;
    dialog.showModal();
  }
  render();
})();
