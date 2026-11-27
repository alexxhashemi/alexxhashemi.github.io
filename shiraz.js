/* Shiraz architecture diagram: trace a route on hover or keyboard focus.
   Inline styles are rewritten and restored verbatim from data-rest (see notes in the original site). */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.arch svg').forEach((svg) => {
    const routes = svg.querySelectorAll('.route');
    if (!routes.length) return;

    const others = svg.querySelectorAll('.dimmable');
    const HIGHLIGHT = 'var(--accent)';

    svg.querySelectorAll('.rt-line, .rt-dash, .rt-head, .rt-head-dim, .rt-box')
      .forEach((el) => el.setAttribute('data-rest', el.getAttribute('style') || ''));

    const activate = (group) => {
      routes.forEach((r) => { if (r !== group) r.classList.add('is-dim'); });
      others.forEach((o) => o.classList.add('is-dim'));
      group.classList.add('is-active');

      group.querySelectorAll('[data-rest]').forEach((el) => {
        let s = el.getAttribute('data-rest');
        const isHead = el.classList.contains('rt-head') ||
                       el.classList.contains('rt-head-dim');
        if (isHead) {
          // arrowheads are filled shapes
          s = s.replace(/fill:[^;]*/, 'fill:' + HIGHLIGHT);
        } else {
          // lines, dashes and boxes recolour stroke only, never fill, so the
          // box keeps var(--surface-2) and the connectors keep fill:none
          s = s.replace(/stroke:[^;]*/, 'stroke:' + HIGHLIGHT);
          s = s.replace(/stroke-width:([\d.]+)/,
                        (m, w) => 'stroke-width:' + (parseFloat(w) + 1.2).toFixed(1));
        }
        el.setAttribute('style', s);
      });
    };

    const clear = () => {
      routes.forEach((r) => {
        r.classList.remove('is-dim', 'is-active');
        r.querySelectorAll('[data-rest]').forEach(
          (el) => el.setAttribute('style', el.getAttribute('data-rest')));
      });
      others.forEach((o) => o.classList.remove('is-dim'));
    };

    routes.forEach((g) => {
      g.setAttribute('tabindex', '0');   // same trace reachable by keyboard
      g.setAttribute('role', 'img');
      g.addEventListener('mouseenter', () => activate(g));
      g.addEventListener('mouseleave', clear);
      g.addEventListener('focus', () => activate(g));
      g.addEventListener('blur', clear);
    });

    // safety net: leaving the figure between two routes must not strand one lit
    svg.addEventListener('mouseleave', clear);
  });

});
