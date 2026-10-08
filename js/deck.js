/* Slide navigation + tiny Dart/YAML highlighter — no dependencies.
   Keys: → ↓ Space PageDown = next · ← ↑ Shift+Space PageUp = previous
         Home/End · F fullscreen · N speaker notes · T light/dark theme */
(() => {
  const root = document.documentElement;
  const themeKey = `deck-theme:${location.pathname}`;

  try {
    const saved = localStorage.getItem(themeKey);
    if (saved) root.dataset.theme = saved;
  } catch (e) { /* storage unavailable */ }

  /* ---------- Code highlighting ---------- */
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const DART_KW = new Set(['import', 'void', 'class', 'extends', 'return', 'const', 'final', 'var',
    'super', 'new', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'this', 'static',
    'late', 'required', 'with', 'implements']);

  function dartLine(line) {
    const re = /(\/\/.*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(@\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index));
      const t = m[0];
      let cls;
      if (m[1]) cls = 'tk-com';
      else if (m[2]) cls = 'tk-str';
      else if (m[3]) cls = 'tk-ann';
      else if (m[4]) cls = 'tk-num';
      else {
        const rest = line.slice(m.index + t.length);
        const prev = line.slice(0, m.index);
        if (DART_KW.has(t)) cls = 'tk-kw';
        else if (/^[A-Z]/.test(t)) cls = 'tk-type';
        else if (/^\s*\(/.test(rest)) cls = 'tk-fn';
        else if (/^\s*:(?!:)/.test(rest)) cls = 'tk-prop';
        else if (/\.\s*$/.test(prev)) cls = 'tk-prop';
        else cls = 'tk-var';
      }
      out += `<span class="${cls}">${esc(t)}</span>`;
      last = m.index + t.length;
    }
    return out + esc(line.slice(last));
  }

  function yamlLine(line) {
    const c = line.match(/^(\s*)(#.*)$/);
    if (c) return `${esc(c[1])}<span class="tk-com">${esc(c[2])}</span>`;
    const k = line.match(/^(\s*)([\w-]+)(:)(.*)$/);
    if (!k) return esc(line);
    let [, indent, key, colon, rest] = k;
    let comment = '';
    const ci = rest.indexOf(' #');
    if (ci >= 0) { comment = rest.slice(ci); rest = rest.slice(0, ci); }
    let val = esc(rest);
    if (/^\s*["']/.test(rest)) val = `<span class="tk-str">${esc(rest)}</span>`;
    else if (/^\s*[\^\d]/.test(rest)) val = `<span class="tk-num">${esc(rest)}</span>`;
    else if (rest.trim()) val = `<span class="tk-val">${esc(rest)}</span>`;
    const com = comment ? `<span class="tk-com">${esc(comment)}</span>` : '';
    return `${esc(indent)}<span class="tk-key">${esc(key)}</span>${colon}${val}${com}`;
  }

  function ranges(spec) {
    const set = new Set();
    (spec || '').split(',').forEach(part => {
      const [a, b] = part.split('-').map(Number);
      if (!a) return;
      for (let n = a; n <= (b || a); n++) set.add(n);
    });
    return set;
  }

  document.querySelectorAll('pre.hl').forEach(pre => {
    const lang = pre.dataset.lang || 'dart';
    const src = pre.textContent.replace(/^\n/, '').replace(/\s+$/, '');
    const hl = ranges(pre.dataset.hl);
    const groups = {};
    (pre.dataset.groups || '').split(';').forEach(g => {
      const [r, cls] = g.split(':');
      if (r && cls) ranges(r).forEach(n => { groups[n] = cls; });
    });
    const start = parseInt(pre.dataset.start || '1', 10);
    if (start > 1) pre.style.counterReset = `line ${start - 1}`;
    pre.innerHTML = src.split('\n').map((line, i) => {
      const n = i + start;
      const cls = ['ln'];
      if (hl.has(n)) cls.push('is-hl');
      if (groups[n]) cls.push(groups[n]);
      const html = lang === 'yaml' ? yamlLine(line) : dartLine(line);
      return `<span class="${cls.join(' ')}">${html || ' '}</span>`;
    }).join('');
    if (hl.size) {
      const box = pre.closest('.code');
      if (box) box.classList.add('has-hl');
    }
  });

  /* ---------- Slides ---------- */
  const slides = [...document.querySelectorAll('.slide')];
  const total = slides.length;
  const bar = document.querySelector('.progress span');
  const notesPanel = document.querySelector('.notes-panel');
  let current = 0;

  slides.forEach((slide, n) => {
    const heading = slide.querySelector('h1, h2');
    const name = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${n + 1} of ${total}: ${name}`);
    slide.querySelectorAll('.num').forEach(el => {
      el.textContent = `${String(n + 1).padStart(2, '0')} / ${total}`;
    });
    slide.querySelectorAll('.stagger').forEach(group => {
      [...group.children].forEach((child, k) => child.style.setProperty('--d', `${140 + k * 75}ms`));
    });
  });

  function go(n) {
    current = Math.max(0, Math.min(total - 1, n));
    slides.forEach((slide, k) => {
      const active = k === current;
      slide.classList.toggle('is-active', active);
      slide.classList.toggle('is-past', k < current);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    if (bar) bar.style.width = `${((current + 1) / total) * 100}%`;
    const hash = `#${current + 1}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { location.hash = hash; }
    }
    renderNotes();
  }

  const next = () => go(current + 1);
  const prev = () => go(current - 1);

  function renderNotes() {
    if (!notesPanel || notesPanel.hidden) return;
    const aside = slides[current].querySelector('.notes');
    notesPanel.querySelector('.np-title').textContent = `Speaker notes · slide ${current + 1} of ${total}`;
    notesPanel.querySelector('.np-body').innerHTML = aside ? aside.innerHTML : '<p>No notes for this slide.</p>';
  }

  function toggleNotes() {
    if (!notesPanel) return;
    notesPanel.hidden = !notesPanel.hidden;
    renderNotes();
  }

  function toggleTheme() {
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch (e) { /* ignore */ }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const req = root.requestFullscreen && root.requestFullscreen();
      if (req && req.catch) req.catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key;
    if ((k === ' ' || k === 'Enter') && (tag === 'BUTTON' || tag === 'SUMMARY')) return;

    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) {
      e.preventDefault(); next();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) {
      e.preventDefault(); prev();
    } else if (k === 'Home') {
      e.preventDefault(); go(0);
    } else if (k === 'End') {
      e.preventDefault(); go(total - 1);
    } else if (k === 'f' || k === 'F') {
      toggleFullscreen();
    } else if (k === 'n' || k === 'N') {
      toggleNotes();
    } else if (k === 't' || k === 'T') {
      toggleTheme();
    }
  });

  let touchX = null;
  let touchY = null;
  addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    touchX = null;
  });

  const fromHash = () => {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  };
  addEventListener('hashchange', () => go(fromHash()));

  const hint = document.querySelector('.hint');
  if (hint) {
    setTimeout(() => hint.classList.add('is-on'), 700);
    setTimeout(() => hint.classList.remove('is-on'), 5600);
  }

  go(fromHash());
})();
