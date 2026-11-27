/* Sky extras for Signal City: a satellite that drifts across the sky with a blinking
   beacon, and the occasional meteor at night. Load after city.js:
   a script tag for sky-extras.js placed right after the one for city.js.
   Respects reduced motion (satellite stays still, no meteors) and pauses when the
   tab is hidden. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function init() {
    var svg = document.getElementById('city');
    var sky = svg && svg.querySelector('g.sky');
    if (!sky) return;

    var css = document.createElement('style');
    css.textContent = [
      '.city .sat-body{fill:#c9ccd4;stroke:#06090d;stroke-width:1}',
      '.city .sat-panel{fill:#2f5f8a;stroke:#06090d;stroke-width:1}',
      '.city .sat-grid{stroke:#7fb2d9;stroke-width:0.6}',
      '.city .sat-dish{fill:none;stroke:#c9ccd4;stroke-width:1.4}',
      '.city .sat-led{fill:#ff6b5a;animation:satBlink 1.6s steps(1) infinite}',
      '@keyframes satBlink{0%{opacity:1}50%{opacity:0.15}}',
      '.city .meteor{opacity:0}',
      ':root[data-theme="light"] .city .meteor{display:none}',
      ':root[data-theme="light"] .city .sat-body{stroke:#2a3446}',
      ':root[data-theme="light"] .city .sat-panel{stroke:#2a3446}',
      '@media (prefers-reduced-motion: reduce){.city .sat-led{animation:none}.city .meteor{display:none}}'
    ].join('\n');
    document.head.appendChild(css);

    var defs = svg.querySelector('defs') || el('defs', {}, svg);
    var grad = el('linearGradient', { id: 'meteorTail', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0' }, grad);
    el('stop', { offset: '0.75', 'stop-color': '#ffe7b0', 'stop-opacity': '0.55' }, grad);
    el('stop', { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '1' }, grad);

    // ---- satellite: body, two solar wings, a small dish and a blinking beacon
    var sat = el('g', { 'class': 'satellite' }, sky);
    var tilt = el('g', { transform: 'rotate(-12) scale(1.5)' }, sat);
    el('rect', { 'class': 'sat-panel', x: -27, y: -4, width: 17, height: 8 }, tilt);
    el('rect', { 'class': 'sat-panel', x: 10, y: -4, width: 17, height: 8 }, tilt);
    el('path', { 'class': 'sat-grid', d: 'M-21.3,-4 V4 M-15.6,-4 V4 M15.7,-4 V4 M21.3,-4 V4 M-27,0 H-10 M10,0 H27' }, tilt);
    el('path', { 'class': 'sat-body', d: 'M-10,-1 H-6 M6,-1 H10', style: 'stroke-width:1.4' }, tilt);
    el('rect', { 'class': 'sat-body', x: -6, y: -5, width: 12, height: 10, rx: 1.5 }, tilt);
    el('path', { 'class': 'sat-dish', d: 'M-3,-5 L0,-10 L3,-5' }, tilt);
    el('circle', { 'class': 'sat-led', cx: 0, cy: -11, r: 1.6 }, tilt);

    // ---- meteors: a bright head with a fading tail
    var meteors = [];
    for (var i = 0; i < 1; i++) {
      var g = el('g', { 'class': 'meteor' }, sky);
      el('rect', { x: -120, y: -1.4, width: 120, height: 2.8, rx: 1.4, fill: 'url(#meteorTail)' }, g);
      el('circle', { cx: 0, cy: 0, r: 2.6, fill: '#ffffff' }, g);
      meteors.push({ g: g, t0: 0, dur: 0, x0: 0, y0: 0, dx: 0, dy: 0, next: 6000 + Math.random() * 8000 });
    }

    var W = 980, reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SAT_PERIOD = 46000;   // ms to cross the sky

    function place(now) {
      // satellite on a gentle arc from left to right, then a pause off-screen
      var k = (now % (SAT_PERIOD + 8000)) / SAT_PERIOD;
      if (reduced) k = 0.22;
      var x = -40 + k * (W + 80), y = 70 - Math.sin(Math.min(k, 1) * Math.PI) * 34;
      sat.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
      sat.style.display = k > 1 ? 'none' : '';

      if (reduced) return;
      meteors.forEach(function (m) {
        if (!m.dur && now > m.next) {
          // launch: start somewhere along the top, fall down-left or down-right
          var dir = Math.random() < 0.5 ? 1 : -1;
          m.x0 = 120 + Math.random() * (W - 240); m.y0 = 10 + Math.random() * 60;
          m.dx = dir * (240 + Math.random() * 160); m.dy = 110 + Math.random() * 70;
          m.t0 = now; m.dur = 900 + Math.random() * 500;
        }
        if (m.dur) {
          var p = (now - m.t0) / m.dur;
          if (p >= 1) { m.dur = 0; m.next = now + 25000 + Math.random() * 15000; m.g.style.opacity = 0; return; }  // about two a minute
          var ang = Math.atan2(m.dy, m.dx) * 180 / Math.PI;
          m.g.setAttribute('transform', 'translate(' + (m.x0 + m.dx * p).toFixed(1) + ',' + (m.y0 + m.dy * p).toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
          m.g.style.opacity = (p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1).toFixed(2);
        }
      });
    }

    function loop(now) {
      if (!document.hidden) place(now);
      if (!reduced) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
