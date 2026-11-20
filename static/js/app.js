(function () {
  'use strict';

  function start() {
    var P = window.SongloftPlugin;
    var $ = function (id) { return document.getElementById(id); };
    var state = null;
    var poll = null;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function time(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleString();
    }
    function msg(text, bad) {
      $('msg').textContent = text || '';
      $('msg').className = bad ? 'err' : 'muted';
    }

    function render() {
      var s = state.settings;
      if (document.activeElement && document.activeElement.tagName !== 'INPUT') {
        $('source').value = s.source;
        $('interval').value = s.intervalMinutes;
        $('max').value = s.maxEpisodes;
        $('prefix').value = s.prefix;
      }
      $('last').textContent = state.busy ? '同步中…' :
        (state.lastRun ? '上次同步 ' + time(state.lastRun) : '尚未同步');
      $('sync').disabled = !!state.busy;
      var html = '';
      state.feeds.forEach(function (f) {
        var st = state.statuses[f.slug] || {};
        var on = s.feeds.indexOf(f.slug) >= 0;
        var info = st.count != null
          ? st.count + ' 集' + (st.added ? '，新增 ' + st.added : '') + (st.removed ? '，移除 ' + st.removed : '') +
            '<div class="muted">最新：' + esc(st.newest) + '</div><div class="muted">' + time(st.lastSuccess) + '</div>'
          : '<span class="muted">未同步</span>';
        if (st.error) info += '<div class="err">' + esc(st.error) + '</div>';
        html += '<tr><td><input type="checkbox" data-slug="' + f.slug + '"' + (on ? ' checked' : '') + '></td>' +
          '<td>' + esc(f.name) + '<div class="muted">' + esc(s.source + '/' + f.slug + '.m3u8') + '</div></td>' +
          '<td>' + info + '</td></tr>';
      });
      $('rows').innerHTML = html;
    }

    function load() {
      return P.apiGet('/api/state').then(function (d) {
        state = d;
        render();
        if (state.busy && !poll) poll = setInterval(load, 2000);
        if (!state.busy && poll) { clearInterval(poll); poll = null; }
        if (!state.replaceSupported) msg('Songloft 服务端版本过旧，无法同步歌单，请升级。', true);
      }).catch(function (e) { msg('读取状态失败：' + e.message, true); });
    }

    function collect() {
      var feeds = [];
      Array.prototype.forEach.call(document.querySelectorAll('#rows input[type=checkbox]'), function (c) {
        if (c.checked) feeds.push(c.getAttribute('data-slug'));
      });
      return {
        source: $('source').value,
        intervalMinutes: Number($('interval').value),
        maxEpisodes: Number($('max').value),
        prefix: $('prefix').value,
        feeds: feeds
      };
    }

    $('save').addEventListener('click', function () {
      P.apiPost('/api/settings', collect()).then(function () {
        msg('已保存');
        return load();
      }).catch(function (e) { msg('保存失败：' + e.message, true); });
    });

    $('sync').addEventListener('click', function () {
      P.apiPost('/api/settings', collect()).then(function () {
        return P.apiPost('/api/sync', {});
      }).then(function () {
        msg('已开始同步，全部 9 个节目约需 1 分钟');
        return load();
      }).catch(function (e) { msg('同步失败：' + e.message, true); });
    });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
