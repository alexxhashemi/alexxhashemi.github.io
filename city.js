/* Signal City: a rotatable isometric city for Alex Hashemi's academic site.
   Original illustration and engine. No libraries.

   How it works
   - Every building is made of flat 3D faces in world coordinates (x, y on the ground, z up).
   - For the current rotation angle we project each face to the screen, hide faces that point
     away from the viewer, shade the rest by which way they face, and draw objects back to front.
   - The static city is redrawn only when the angle changes. Cars and signal dots are separate
     elements that are slotted into the right depth position every frame.
*/
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- projection
  var U = 31, C30 = Math.cos(Math.PI / 6), CX = 8, CY = 8;
  var W = 980, H = 760, OX = W / 2, OY = 392;
  var cosT = 1, sinT = 0;

  function setAngle(t) { cosT = Math.cos(t); sinT = Math.sin(t); }
  function rot(x, y) { var dx = x - CX, dy = y - CY; return [dx * cosT - dy * sinT, dx * sinT + dy * cosT]; }
  function P(x, y, z) {
    var r = rot(x, y);
    return [OX + (r[0] - r[1]) * U * C30, OY + (r[0] + r[1]) * U * 0.5 - (z || 0) * U];
  }
  function depthXY(x, y) { var r = rot(x, y); return r[0] + r[1]; }
  function pts(list) {
    var s = '';
    for (var i = 0; i < list.length; i++) {
      var q = P(list[i][0], list[i][1], list[i][2]);
      s += (i ? ' ' : '') + q[0].toFixed(1) + ',' + q[1].toFixed(1);
    }
    return s;
  }
  function facing(n) {           // rotated normal
    return [n[0] * cosT - n[1] * sinT, n[0] * sinT + n[1] * cosT, n[2]];
  }
  function visible(n) { var r = facing(n); return r[0] + r[1] + r[2] > 0.02; }
  function shadeOf(face) {
    if (face.cls) return face.cls;
    if (face.n[2] > 0.55) return face.m + '-t';
    var r = facing(face.n);
    return face.m + (r[1] > r[0] ? '-l' : '-r');
  }

  // ---------------------------------------------------------------- geometry helpers
  function newell(p) {
    var nx = 0, ny = 0, nz = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  function centroid(p) {
    var c = [0, 0, 0];
    p.forEach(function (q) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; });
    return [c[0] / p.length, c[1] / p.length, c[2] / p.length];
  }

  /* A part is a (nearly) convex solid: a list of faces {pts, n, m, decals}.
     faces given as {pts, m}; normals are computed and pointed outward. */
  function solid(faces, layer) {
    var all = [];
    faces.forEach(function (f) { all = all.concat(f.pts); });
    var c = centroid(all);
    faces.forEach(function (f) {
      var n = newell(f.pts), fc = centroid(f.pts);
      if (n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2]) < 0) n = [-n[0], -n[1], -n[2]];
      f.n = n; f.c = fc; f.decals = f.decals || [];
    });
    return { faces: faces, c: c, layer: layer || 0, f: {} };
  }

  function box(x, y, z, w, d, h, m, layer) {
    var t = z + h;
    var F = {
      'top': { pts: [[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]], m: m },
      '+y': { pts: [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t]], m: m },
      '-y': { pts: [[x, y, z], [x + w, y, z], [x + w, y, t], [x, y, t]], m: m },
      '+x': { pts: [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t]], m: m },
      '-x': { pts: [[x, y, z], [x, y + d, z], [x, y + d, t], [x, y, t]], m: m }
    };
    var part = solid([F.top, F['+y'], F['-y'], F['+x'], F['-x']], layer);
    part.f = F; part.box = [x, y, z, w, d, h];
    return part;
  }

  // oriented box for cars (any heading)
  function obox(cx, cy, z, len, wid, h, ang, m) {
    var hx = Math.cos(ang) * len / 2, hy = Math.sin(ang) * len / 2;
    var px = -Math.sin(ang) * wid / 2, py = Math.cos(ang) * wid / 2;
    var c = [[cx - hx - px, cy - hy - py], [cx + hx - px, cy + hy - py], [cx + hx + px, cy + hy + py], [cx - hx + px, cy - hy + py]];
    var t = z + h, faces = [{ pts: c.map(function (q) { return [q[0], q[1], t]; }), m: m }];
    for (var i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4];
      faces.push({ pts: [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], t], [a[0], a[1], t]], m: m });
    }
    return solid(faces);
  }

  // roof with the ridge running along x (gable ends on the x faces)
  function gableX(x, y, zt, w, d, r, roof, wall, layer) {
    var ym = y + d / 2, zr = zt + r, o = 0.12;
    return solid([
      { pts: [[x - o, y - o, zt], [x + w + o, y - o, zt], [x + w + o, ym, zr], [x - o, ym, zr]], m: roof },
      { pts: [[x - o, y + d + o, zt], [x + w + o, y + d + o, zt], [x + w + o, ym, zr], [x - o, ym, zr]], m: roof },
      { pts: [[x, y, zt], [x, y + d, zt], [x, ym, zr]], m: wall },
      { pts: [[x + w, y, zt], [x + w, y + d, zt], [x + w, ym, zr]], m: wall }
    ], layer === undefined ? 1 : layer);
  }
  // roof with the ridge running along y (gable ends / pediments on the y faces)
  function gableY(x, y, zt, w, d, r, roof, wall, layer) {
    var xm = x + w / 2, zr = zt + r, o = 0.12;
    return solid([
      { pts: [[x - o, y - o, zt], [x - o, y + d + o, zt], [xm, y + d + o, zr], [xm, y - o, zr]], m: roof },
      { pts: [[x + w + o, y - o, zt], [x + w + o, y + d + o, zt], [xm, y + d + o, zr], [xm, y - o, zr]], m: roof },
      { pts: [[x, y, zt], [x + w, y, zt], [xm, y, zr]], m: wall },
      { pts: [[x, y + d, zt], [x + w, y + d, zt], [xm, y + d, zr]], m: wall }
    ], layer === undefined ? 1 : layer);
  }
  function sawtooth(x, y, zt, w, d, n, r, roof) {
    var parts = [], s = w / n;
    for (var k = 0; k < n; k++) {
      var a = x + k * s, b = a + s;
      parts.push(solid([
        { pts: [[a, y, zt], [a, y + d, zt], [b, y + d, zt + r], [b, y, zt + r]], m: roof },
        { pts: [[b, y, zt], [b, y + d, zt], [b, y + d, zt + r], [b, y, zt + r]], m: 'glass' },
        { pts: [[a, y, zt], [b, y, zt], [b, y, zt + r]], m: roof },
        { pts: [[a, y + d, zt], [b, y + d, zt], [b, y + d, zt + r]], m: roof }
      ], 1));
    }
    return parts;
  }

  // ---- decals on box faces: windows, doors, LEDs, signs
  var WIN = [];          // window lit states, shared across renders
  function faceFrame(part, key) {
    var b = part.box, x = b[0], y = b[1], w = b[3], d = b[4], e = 0.012;
    switch (key) {
      case '+y': return { o: [x, y + d + e], h: [1, 0], len: w };
      case '-y': return { o: [x + w, y - e], h: [-1, 0], len: w };
      case '+x': return { o: [x + w + e, y + d], h: [0, -1], len: d };
      case '-x': return { o: [x - e, y], h: [0, 1], len: d };
    }
  }
  function rectOn(part, key, u0, u1, z0, z1) {
    var f = faceFrame(part, key);
    function at(u, z) { return [f.o[0] + f.h[0] * u, f.o[1] + f.h[1] * u, z]; }
    return [at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)];
  }
  function windows(part, keys, cols, rows, opt) {
    opt = opt || {};
    var b = part.box, z = b[2] + (opt.zFrom || 0), h = (opt.zTo || b[5]) - (opt.zFrom || 0);
    keys.split(' ').forEach(function (key) {
      var len = faceFrame(part, key).len, m = opt.m || 0.22, mz = opt.mz || 0.25;
      var cw = (len - 2 * m) / cols, rh = (h - 2 * mz) / rows;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var u0 = m + c * cw + cw * 0.2, z0 = z + mz + r * rh + rh * 0.22;
        WIN.push(Math.random() < (opt.lit === undefined ? 0.72 : opt.lit));
        part.f[key].decals.push({ pts: rectOn(part, key, u0, u0 + cw * 0.6, z0, z0 + rh * 0.56), w: WIN.length - 1 });
      }
    });
  }
  function decal(part, key, u0, u1, z0, z1, cls, style) {
    part.f[key].decals.push({ pts: rectOn(part, key, u0, u1, z0, z1), cls: cls, style: style });
  }
  function sign(part, keys, txt, z, size, cls) {
    keys.split(' ').forEach(function (key) {
      var f = faceFrame(part, key);
      var width = txt.length * size * 0.62 / U;
      var u = Math.max(0.05, (f.len - width) / 2);
      part.f[key].decals.push({ text: txt, o: [f.o[0] + f.h[0] * u, f.o[1] + f.h[1] * u, z], h: f.h, size: size, cls: cls || 'sign' });
    });
  }

  // ---------------------------------------------------------------- render helpers
  function faceSVG(face) {
    if (!visible(face.n)) return '';
    var s = '<polygon class="' + shadeOf(face) + ' e' + (face.wbar !== undefined ? ' wbar" style="animation-delay:-' + ((face.wbar * 0.17) % 1.6).toFixed(2) + 's' : '') + '" points="' + pts(face.pts) + '"/>';
    face.decals.forEach(function (d) {
      if (d.text) {
        var o = P(d.o[0], d.o[1], d.o[2]), a = P(d.o[0] + d.h[0], d.o[1] + d.h[1], d.o[2]);
        s += '<text class="' + d.cls + '" font-size="' + d.size + '" transform="matrix(' +
          ((a[0] - o[0]) / U).toFixed(4) + ',' + ((a[1] - o[1]) / U).toFixed(4) + ',0,1,' +
          o[0].toFixed(1) + ',' + o[1].toFixed(1) + ')">' + d.text + '</text>';
      } else if (d.w !== undefined) {
        s += '<polygon class="' + (WIN[d.w] ? 'win' : 'windark') + '" data-w="' + d.w + '" points="' + pts(d.pts) + '"/>';
      } else {
        s += '<polygon class="' + d.cls + '"' + (d.style ? ' style="' + d.style + '"' : '') + ' points="' + pts(d.pts) + '"/>';
      }
    });
    return s;
  }
  function partSVG(part) {
    var fs = part.faces.slice().sort(function (a, b) {
      return (depthXY(a.c[0], a.c[1]) + a.c[2] * 0.01) - (depthXY(b.c[0], b.c[1]) + b.c[2] * 0.01);
    });
    return fs.map(faceSVG).join('');
  }
  // a box that something else stands on (a plinth, a base) must be drawn before it,
  // whatever the viewing angle; otherwise its top face paints over the walls above it
  function under(a, b) {
    if (!a.box || !b.box) return false;
    var A = a.box, B = b.box;
    return A[2] + A[5] <= B[2] + 0.01 &&
      A[0] < B[0] + B[3] && B[0] < A[0] + A[3] && A[1] < B[1] + B[4] && B[1] < A[1] + A[4];
  }
  function partsSVG(parts) {
    return parts.slice().sort(function (a, b) {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (under(a, b)) return -1;
      if (under(b, a)) return 1;
      return depthXY(a.c[0], a.c[1]) - depthXY(b.c[0], b.c[1]);
    }).map(partSVG).join('');
  }
  function flat(cls, list, z) {
    return '<polygon class="' + cls + '" points="' + pts(list.map(function (q) { return [q[0], q[1], z || 0]; })) + '"/>';
  }
  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function ngon(cx, cy, r, n) {
    var a = [];
    for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2; a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
    return a;
  }

  // ---------------------------------------------------------------- the city
  var N = 16, ROADS = [1, 8, 15], HW = 0.65, SW = 0.95;
  var objects = [];   // {id, c:[x,y], parts:[], extra(fn), station}

  function obj(id, cx, cy, parts, extra, station) {
    var o = { id: id, c: [cx, cy], parts: parts, extra: extra, station: station };
    objects.push(o);
    return o;
  }
  function tree(x, y, s) {
    s = s || 1;
    obj('tree' + x + y, x, y, [box(x - 0.09, y - 0.09, 0, 0.18, 0.18, 0.62 * s, 'trunk')], function () {
      var c = P(x, y, 1.0 * s);
      return '<circle class="leaf1 e" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="' + (0.6 * U * s).toFixed(1) + '"/>' +
        '<circle class="leaf2" cx="' + (c[0] - 5 * s).toFixed(1) + '" cy="' + (c[1] - 6 * s).toFixed(1) + '" r="' + (0.3 * U * s).toFixed(1) + '"/>';
    });
  }
  var lampN = 0;
  function lamp(x, y) {
    var k = lampN++;
    obj('lamp' + k, x, y, [box(x - 0.04, y - 0.04, 0, 0.08, 0.08, 1.5, 'navy')], function () {
      var c = P(x, y, 1.56);
      return '<circle class="lamp' + (k === 3 ? ' flicker' : '') + '" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="5"/>';
    });
  }

  // ---- Block NW: Research Lab + mast, Tech Hub, sound wall
  (function () {
    var body = box(2.3, 2.3, 0, 2.6, 2.8, 3.0, 'glass');
    windows(body, '+y -y +x -x', 4, 3);
    decal(body, '+y', 1.0, 1.6, 0, 0.72, 'door');
    var band = box(2.18, 2.18, 3.0, 2.84, 3.04, 0.3, 'teal', 1);
    sign(band, '+y -y +x -x', 'RESEARCH LAB', 3.07, 9, 'sign light');
    var cap = box(2.6, 2.6, 3.3, 0.7, 0.7, 0.25, 'white', 2);
    var mast = box(4.3, 2.75, 3.3, 0.12, 0.12, 1.6, 'navy', 2);
    obj('lab', 3.6, 3.7, [body, band, cap, mast], function () {
      var d = P(2.95, 2.95, 3.85);
      return '<ellipse class="dish" cx="' + d[0].toFixed(1) + '" cy="' + d[1].toFixed(1) + '" rx="12" ry="6.5"/>' +
        '<line class="mast" x1="' + d[0].toFixed(1) + '" y1="' + (d[1] + 2).toFixed(1) + '" x2="' + d[0].toFixed(1) + '" y2="' + (d[1] + 12).toFixed(1) + '"/>';
    }, { href: 'research.html', name: 'Research', desc: 'Research Lab', anchor: [3.6, 3.7, 4.6] });

    var hub = box(5.3, 2.4, 0, 1.6, 2.5, 2.1, 'navy');
    for (var r = 0; r < 4; r++) for (var c = 0; c < 5; c++) {
      ['+y', '-x', '+x', '-y'].forEach(function (k) {
        var len = faceFrame(hub, k).len, cw = (len - 0.3) / 5;
        decal(hub, k, 0.15 + c * cw + cw * 0.25, 0.15 + c * cw + cw * 0.6, 0.35 + r * 0.42, 0.45 + r * 0.42,
          'led', 'animation-delay:-' + (Math.random() * 2).toFixed(2) + 's');
      });
    }
    var hubTop = box(5.25, 2.35, 2.1, 1.7, 2.6, 0.18, 'teal', 1);
    var cube = box(5.75, 3.25, 2.28, 0.7, 0.7, 0.55, 'amber', 2);
    sign(cube, '+y -y +x -x', '&lt;/&gt;', 2.4, 9, 'sign');
    sign(hub, '+y -y +x -x', 'TECH HUB', 1.92, 8, 'sign light');
    obj('hub', 6.1, 3.65, [hub, hubTop, cube], null,
      { href: 'about.html#skills', name: 'Technical Skills', desc: 'Tech Hub', anchor: [6.1, 3.65, 3.2] });

    var bars = [];
    for (var i = 0; i < 16; i++) {
      var t = i / 15, hh = 0.25 + 1.35 * Math.abs(Math.sin(t * Math.PI * 3.2)) * Math.sin(t * Math.PI);
      var b = box(2.35 + i * 0.29, 5.75, 0, 0.21, 0.28, hh, ['coral', 'amber', 'teal'][i % 3]);
      b.faces.forEach(function (f) { f.cls = null; f.wbar = i; });
      bars.push(b);
    }
    obj('wall', 4.6, 5.9, bars, null);
  })();

  // ---- Block NE: Library, Conference Hall, Makerspace
  (function () {
    var plinth = box(9.2, 2.2, 0, 2.9, 2.9, 0.22, 'white');
    var body = box(9.45, 2.35, 0.22, 2.4, 2.35, 1.7, 'cream');
    windows(body, '-y +x -x', 3, 2);
    var cols = [];
    for (var k = 0; k < 5; k++) cols.push(box(9.55 + k * 0.5, 4.8, 0.22, 0.18, 0.18, 1.7, 'white'));
    var ent = box(9.3, 2.25, 1.92, 2.7, 2.78, 0.22, 'amber', 1);
    sign(ent, '+y -y', 'LIBRARY', 1.97, 9, 'sign');
    var ped = gableY(9.3, 2.25, 2.14, 2.7, 2.78, 0.7, 'amber', 'amber', 2);
    obj('library', 10.65, 3.65, [plinth, body, ent, ped].concat(cols), null,
      { href: 'publications.html', name: 'Publications', desc: 'Library', anchor: [10.65, 3.65, 3.4] });

    var hall = box(12.4, 2.3, 0, 1.6, 2.9, 1.9, 'brick');
    windows(hall, '+x -x', 3, 1, { zTo: 1.0 });
    decal(hall, '+y', 0.2, 1.4, 0.75, 1.65, 'screen');
    decal(hall, '-y', 0.2, 1.4, 0.75, 1.65, 'screen');
    decal(hall, '+y', 0.6, 1.0, 0, 0.6, 'door');
    var roof = box(12.3, 2.2, 1.9, 1.8, 3.1, 0.22, 'navy', 1);
    sign(roof, '+y -y +x -x', 'TALKS', 1.96, 9, 'sign light');
    obj('hall', 13.2, 3.75, [hall, roof], null,
      { href: 'talks.html', name: 'Talks', desc: 'Conference Hall', anchor: [13.2, 3.75, 2.9] });

    var shop = box(9.3, 5.45, 0, 2.7, 1.45, 1.25, 'cream');
    windows(shop, '-x +x', 2, 1);
    decal(shop, '+y', 0.3, 1.1, 0, 0.85, 'rolldoor');
    sign(shop, '+y -y', 'MAKERSPACE', 1.0, 8, 'sign');
    var saw = sawtooth(9.3, 5.45, 1.25, 2.7, 1.45, 3, 0.5, 'teal');
    function robot(x, y, m) {
      return [box(x, y, 0, 0.32, 0.32, 0.36, m), box(x + 0.04, y + 0.04, 0.36, 0.24, 0.24, 0.22, m, 1)];
    }
    var bots = robot(12.4, 5.7, 'glass').concat(robot(12.95, 6.15, 'amber'));
    obj('shop', 10.65, 6.2, [shop].concat(saw), null,
      { href: 'projects.html', name: 'Projects', desc: 'Makerspace', anchor: [10.65, 6.2, 2.3] });
    obj('bots', 12.8, 6.1, bots, function () {
      var a = P(12.56, 5.86, 0.5), b = P(13.11, 6.31, 0.5);
      return '<circle class="eye" cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="2"/>' +
        '<circle class="eye" cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="2"/>';
    });
  })();

  // ---- Block SW: Home, Post Office, park
  var CHIMNEY = [4.05, 9.85, 2.5];
  (function () {
    var house = box(2.3, 9.3, 0, 2.4, 2.0, 1.35, 'cream');
    windows(house, '+y -y +x -x', 2, 1, { lit: 0.9 });
    decal(house, '+y', 1.0, 1.45, 0, 0.75, 'door');
    var roof = gableX(2.3, 9.3, 1.35, 2.4, 2.0, 0.9, 'coral', 'cream');
    var chim = box(3.9, 9.7, 1.7, 0.3, 0.3, 0.8, 'brick', 2);
    obj('home', 3.5, 10.3, [house, roof, chim], null,
      { href: 'about.html', name: 'About Me', desc: 'Home', anchor: [3.5, 10.3, 2.9] });

    var po = box(2.3, 12.2, 0, 2.5, 1.6, 1.3, 'brick');
    windows(po, '-y +x -x', 2, 1);
    decal(po, '+y', 1.0, 1.5, 0, 0.75, 'door');
    var poRoof = box(2.2, 12.1, 1.3, 2.7, 1.8, 0.2, 'navy', 1);
    sign(poRoof, '+y -y', 'POST OFFICE', 1.34, 8, 'sign light');
    sign(po, '+x -x', 'POST', 0.95, 8, 'sign light');
    var mb = [box(5.2, 13.3, 0, 0.1, 0.1, 0.55, 'navy'), box(5.05, 13.2, 0.55, 0.4, 0.3, 0.32, 'teal'), box(5.42, 13.25, 0.68, 0.03, 0.05, 0.28, 'coral', 1)];
    obj('post', 3.55, 13.0, [po, poRoof], null,
      { href: 'contact.html', name: 'Contact', desc: 'Post Office', anchor: [3.55, 13.0, 2.1] });
    obj('mailbox', 5.25, 13.35, mb, null,
      { href: 'contact.html', name: 'Contact', desc: 'Post Office', anchor: [5.25, 13.35, 1.4] });
  })();

  // ---- Block SE: School + City Offices, VR Gallery, CV billboard
  (function () {
    var school = box(9.3, 9.3, 0, 2.8, 1.8, 1.5, 'cream');
    windows(school, '+y -y', 4, 1, { lit: 0.85 });
    windows(school, '+x -x', 2, 1);
    var roof = gableX(9.3, 9.3, 1.5, 2.8, 1.8, 0.75, 'brick', 'cream');
    var bell = box(10.45, 9.95, 2.0, 0.5, 0.5, 0.75, 'amber', 2);
    var bellRoof = gableX(10.45, 9.95, 2.75, 0.5, 0.5, 0.35, 'brick', 'amber', 3);
    sign(school, '+y -y', 'SCHOOL', 1.3, 8, 'sign');
    var tower = box(12.6, 9.2, 0, 1.4, 1.4, 4.4, 'glass');
    windows(tower, '+y -y +x -x', 2, 6, { lit: 0.65 });
    var tTop = box(12.55, 9.15, 4.4, 1.5, 1.5, 0.2, 'navy', 1);
    sign(tTop, '+y -y +x -x', 'OFFICES', 4.43, 7.5, 'sign light');
    obj('school', 10.7, 10.2, [school, roof, bell, bellRoof], null,
      { href: 'about.html#education', name: 'Education', desc: 'School', anchor: [10.7, 10.2, 3.5] });
    obj('offices', 13.3, 9.9, [tower, tTop], null,
      { href: 'about.html#experience', name: 'Experience', desc: 'City Offices', anchor: [13.3, 9.9, 5.0] });

    var gal = box(9.3, 12.1, 0, 2.7, 1.7, 1.5, 'plum');
    windows(gal, '+x -x', 2, 1);
    decal(gal, '+y', 1.05, 1.65, 0, 0.85, 'glassdoor');
    var gRoof = box(9.2, 12.0, 1.5, 2.9, 1.9, 0.2, 'navy', 1);
    sign(gal, '+y -y', 'VR GALLERY', 1.12, 8, 'sign light');
    var head = box(10.15, 12.6, 1.7, 1.0, 0.55, 0.5, 'navy', 2);
    var strap = box(10.05, 12.75, 1.82, 1.2, 0.25, 0.14, 'coral', 2);
    obj('gallery', 10.65, 12.95, [gal, gRoof, head, strap], function () {
      var a = P(10.4, 13.16, 1.95), b = P(10.9, 13.16, 1.95);
      return '<circle class="lens" cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="4.5"/>' +
        '<circle class="lens" cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="4.5"/>';
    }, { href: 'talks.html#exhibitions', name: 'Exhibitions', desc: 'VR Gallery', anchor: [10.65, 12.95, 2.7] });

    var legs = [box(12.6, 12.85, 0, 0.1, 0.1, 0.9, 'trunk'), box(13.9, 12.85, 0, 0.1, 0.1, 0.9, 'trunk')];
    var panel = box(12.35, 12.8, 0.85, 1.85, 0.16, 1.1, 'white', 1);
    sign(panel, '+y -y', 'CV', 1.25, 16, 'sign bold');
    decal(panel, '+y', 0.85, 1.7, 1.5, 1.55, 'cvline'); decal(panel, '+y', 0.85, 1.6, 1.35, 1.4, 'cvline');
    decal(panel, '+y', 0.85, 1.7, 1.2, 1.25, 'cvline'); decal(panel, '-y', 0.15, 1.0, 1.5, 1.55, 'cvline');
    obj('cv', 13.25, 12.9, legs.concat([panel]), null,
      { href: 'cv.html', name: 'Request my CV', desc: 'Billboard', anchor: [13.25, 12.9, 2.4] });
  })();

  // ---- Interests Square: a fingerpost in the roundabout. Four boards, one per
  // research interest, each pointing a different way out over the city.
  (function () {
    function fit(txt, len, max) { return Math.min(max, (len - 0.2) * U * 0.9 / (txt.length * 0.66)); }
    var parts = [box(7.7, 7.7, 0, 0.6, 0.6, 0.25, 'white'), box(7.93, 7.93, 0.25, 0.14, 0.14, 4.85, 'trunk')];
    // boards that rise on screen sit above boards that fall, so in the default view none cross
    var boards = [
      ['AI + DISABILITY', 'teal', 0, -1], ['ALGORITHMIC AUDITING', 'amber', -1, 0],
      ['TRUSTWORTHY AI', 'plum', 1, 0], ['PARTICIPATORY AI', 'coral', 0, 1]
    ];
    boards.forEach(function (bd, i) {
      var z = 4.5 - i * 0.58, L = 2.6, H = 0.44, T = 0.08, b;
      if (bd[2] === 1) b = box(8.07, 8 - T / 2, z, L, T, H, bd[1]);
      else if (bd[2] === -1) b = box(7.93 - L, 8 - T / 2, z, L, T, H, bd[1]);
      else if (bd[3] === 1) b = box(8 - T / 2, 8.07, z, T, L, H, bd[1]);
      else b = box(8 - T / 2, 7.93 - L, z, T, L, H, bd[1]);
      var keys = bd[2] ? '+y -y' : '+x -x', sz = fit(bd[0], L, 8);
      sign(b, keys, bd[0], z + (H * U - sz * 0.72) / 2 / U, sz, 'sign light');
      parts.push(b);
    });
    var cap = box(7.86, 7.86, 5.1, 0.28, 0.28, 0.12, 'amber', 1);
    parts.push(cap);
    obj('interests', 8, 8, parts, function () {
      var c = P(8, 8, 5.5);
      return '<circle class="beacon" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="4.5"/>';
    }, { href: 'research.html#interests', name: 'Research Interests', desc: 'Interests Square', anchor: [8, 8, 5.9] });
  })();

  // ---- scenery
  [[2.25, 6.75, .75], [6.75, 6.75, .7], [6.8, 5.3, .65], [13.8, 6.75, .75], [9.1, 6.85, .55],
   [5.6, 11.5, .9], [6.7, 12.6, .75], [6.2, 10.9, .6], [2.3, 11.65, .65], [6.6, 13.9, .7],
   [12.4, 11.6, .7], [13.8, 13.85, .8], [9.15, 13.95, .65], [13.9, 11.2, .6]].forEach(function (t) { tree(t[0], t[1], t[2]); });
  [[2.0, 7.1], [14.0, 8.9], [7.1, 2.0], [8.9, 14.0]].forEach(function (l) { lamp(l[0], l[1]); });

  // ---------------------------------------------------------------- ground
  function groundSVG() {
    var s = '';
    s += partSVG(box(-0.4, -0.4, -1.45, N + 0.8, N + 0.8, 0.55, 'base'));
    s += partSVG(box(0, 0, -0.9, N, N, 0.9, 'grass'));
    ROADS.forEach(function (r) {
      s += flat('walk-t', rect(r - SW, 0.05, r + SW, N - 0.05));
      s += flat('walk-t', rect(0.05, r - SW, N - 0.05, r + SW));
    });
    ROADS.forEach(function (r) {
      s += flat('road-t', rect(r - HW, 0.35, r + HW, N - 0.35));
      s += flat('road-t', rect(0.35, r - HW, N - 0.35, r + HW));
    });
    // lane dashes, skipping junctions
    ROADS.forEach(function (r) {
      for (var k = 0.4; k < N - 0.6; k += 0.75) {
        var near = ROADS.some(function (q) { return Math.abs(k + 0.2 - q) < 1.25; });
        if (near) continue;
        s += flat('rline', rect(k, r - 0.035, k + 0.4, r + 0.035));
        s += flat('rline', rect(r - 0.035, k, r + 0.035, k + 0.4));
      }
    });
    // crosswalks at the centre junction and the four mid junctions
    [[8, 8], [8, 1], [8, 15], [1, 8], [15, 8]].forEach(function (j) {
      for (var i = 0; i < 5; i++) {
        var a = -0.52 + i * 0.24;
        if (j[1] !== 1) s += flat('rline', rect(j[0] + a, j[1] - 1.45, j[0] + a + 0.13, j[1] - 1.1));
        if (j[1] !== 15) s += flat('rline', rect(j[0] + a, j[1] + 1.1, j[0] + a + 0.13, j[1] + 1.45));
        if (j[0] !== 1) s += flat('rline', rect(j[0] - 1.45, j[1] + a, j[0] - 1.1, j[1] + a + 0.13));
        if (j[0] !== 15) s += flat('rline', rect(j[0] + 1.1, j[1] + a, j[0] + 1.45, j[1] + a + 0.13));
      }
    });
    // roundabout
    s += flat('road-t', ngon(8, 8, 1.45, 24), 0.001);
    s += flat('walk-t e', ngon(8, 8, 0.82, 20), 0.002);
    s += flat('grass-t', ngon(8, 8, 0.7, 20), 0.003);
    // pond and paths in the park
    s += flat('water e', ngon(6.0, 12.1, 0.62, 14), 0.002);
    s += flat('walk-t', rect(5.15, 10.0, 5.35, 13.0), 0.001);
    return s;
  }

  // ---------------------------------------------------------------- static render
  var lastStatic = [];
  function staticSVG() {
    objects.forEach(function (o) { o.d = depthXY(o.c[0], o.c[1]); });
    var sorted = objects.slice().sort(function (a, b) { return a.d - b.d; });
    lastStatic = sorted;
    var out = '';
    sorted.forEach(function (o) {
      var inner = partsSVG(o.parts) + (o.extra ? o.extra() : '');
      if (o.station) {
        var st = o.station;
        out += '<a class="station" data-depth="' + o.d.toFixed(3) + '" data-id="' + o.id + '" href="' + st.href +
          '" aria-label="' + st.name + ' (' + st.desc + ')"><title>' + st.name + '</title><g class="lift">' + inner + '</g></a>';
      } else {
        out += '<g data-depth="' + o.d.toFixed(3) + '">' + inner + '</g>';
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- road network for cars and dots
  var NODES = { NW: [1, 1], N: [8, 1], NE: [15, 1], E: [15, 8], SE: [15, 15], S: [8, 15], SW: [1, 15], W: [1, 8], C: [8, 8] };
  var LINKS = { NW: ['N', 'W'], N: ['NW', 'NE', 'C'], NE: ['N', 'E'], E: ['NE', 'SE', 'C'], SE: ['E', 'S'],
    S: ['SE', 'SW', 'C'], SW: ['S', 'W'], W: ['SW', 'NW', 'C'], C: ['N', 'E', 'S', 'W'] };
  function dirOf(a, b) { var A = NODES[a], B = NODES[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; }
  function joinPoints(prev, node, next, lane) {
    var d1 = dirOf(prev, node), d2 = dirOf(node, next), n = NODES[node];
    var o1 = [-d1[1] * lane, d1[0] * lane], o2 = [-d2[1] * lane, d2[0] * lane];
    if (node === 'C') {
      var R = 1.12, t = Math.sqrt(Math.max(0.01, R * R - lane * lane));
      var e0 = [n[0] - d1[0] * t + o1[0], n[1] - d1[1] * t + o1[1]], e1 = [n[0] + d2[0] * t + o2[0], n[1] + d2[1] * t + o2[1]];
      var a0 = Math.atan2(e0[1] - n[1], e0[0] - n[0]), a1 = Math.atan2(e1[1] - n[1], e1[0] - n[0]);
      while (a1 > a0 - 0.05) a1 -= Math.PI * 2;
      var out = [e0];
      for (var a = a0 - 0.22; a > a1; a -= 0.22) out.push([n[0] + Math.cos(a) * R, n[1] + Math.sin(a) * R]);
      out.push(e1);
      return out;
    }
    if (Math.abs(d1[0] - d2[0]) < 1e-6 && Math.abs(d1[1] - d2[1]) < 1e-6) return [[n[0] + o1[0], n[1] + o1[1]]];
    return [[n[0] + o1[0] + o2[0], n[1] + o1[1] + o2[1]]];
  }
  function Mover(start, prev, speed, lane, rnd) {
    this.speed = speed; this.lane = lane; this.rnd = rnd;
    this.path = [prev, start]; this.wp = []; this.i = 0; this.s = 0;
    this.extend(); this.extend();
    this.x = this.wp[0][0]; this.y = this.wp[0][1]; this.ang = 0;
  }
  Mover.prototype.pickNext = function () {
    var cur = this.path[this.path.length - 1], prev = this.path[this.path.length - 2];
    var opts = LINKS[cur].filter(function (n) { return n !== prev; });
    return opts[Math.floor(this.rnd() * opts.length)];
  };
  Mover.prototype.extend = function () {
    var next = this.pickNext();
    var p = this.path, prev = p[p.length - 2], cur = p[p.length - 1];
    this.wp = this.wp.concat(joinPoints(prev, cur, next, this.lane));
    p.push(next);
    if (p.length > 6) p.splice(0, p.length - 6);
  };
  Mover.prototype.step = function (dt) {
    var dist = this.speed * dt;
    while (dist > 0) {
      if (this.i >= this.wp.length - 2) this.extend();
      var a = this.wp[this.i], b = this.wp[this.i + 1];
      var seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
      if (this.s + dist < seg) { this.s += dist; dist = 0; }
      else { dist -= seg - this.s; this.s = 0; this.i++; }
    }
    if (this.i > 40) { this.wp = this.wp.slice(this.i); this.i = 0; }
    var A = this.wp[this.i], B = this.wp[this.i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-6, f = this.s / L;
    this.x = A[0] + (B[0] - A[0]) * f; this.y = A[1] + (B[1] - A[1]) * f;
    this.ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  };

  function carSVG(c) {
    var body = obox(c.x, c.y, 0.04, 0.82, 0.44, 0.26, c.ang, c.m);
    var cab = obox(c.x - Math.cos(c.ang) * 0.06, c.y - Math.sin(c.ang) * 0.06, 0.3, 0.44, 0.38, 0.2, c.ang, 'glass');
    var hl = P(c.x + Math.cos(c.ang) * 0.43, c.y + Math.sin(c.ang) * 0.43, 0.17);
    return partSVG(body) + partSVG(cab) +
      '<circle class="hl" cx="' + hl[0].toFixed(1) + '" cy="' + hl[1].toFixed(1) + '" r="3"/>';
  }

  // ---------------------------------------------------------------- exports (for tests in Node)
  var api = {
    W: W, H: H, setAngle: setAngle, P: P, staticSVG: staticSVG, groundSVG: groundSVG, depthXY: depthXY,
    objects: objects, Mover: Mover, carSVG: carSVG, CHIMNEY: CHIMNEY, WIN: WIN
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.SignalCity = api;

  // ================================================================ browser
  var svg = document.getElementById('city');
  if (!svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  var defs = el('defs', {}, svg);
  defs.innerHTML = '<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<radialGradient id="puff"><stop offset="0" stop-color="currentColor" stop-opacity=".9"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>';
  var sky = el('g', { 'class': 'sky', 'aria-hidden': 'true' }, svg);
  var shadow = el('ellipse', { 'class': 'shadow', cx: OX, cy: OY + 312, rx: 400, ry: 40 }, svg);
  var ground = el('g', { 'class': 'ground', 'aria-hidden': 'true' }, svg);
  var layer = el('g', { 'class': 'objects' }, svg);
  var over = el('g', { 'class': 'overlay', 'aria-hidden': 'true' }, svg);

  // stars (night) and clouds (day)
  var rs = 11;
  function rnd() { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; }
  for (var i = 0; i < 46; i++) {
    el('circle', { 'class': 'star', cx: (rnd() * W).toFixed(0), cy: (rnd() * 260).toFixed(0), r: (0.8 + rnd() * 1.3).toFixed(1),
      style: 'animation-delay:-' + (rnd() * 4).toFixed(2) + 's' }, sky);
  }
  [[120, 70, 1], [700, 40, 0.8], [420, 130, 0.65]].forEach(function (c, k) {
    var g = el('g', { 'class': 'cloud', style: 'animation-delay:-' + (k * 14) + 's' }, sky);
    var inner = el('g', { transform: 'translate(' + c[0] + ',' + c[1] + ') scale(' + c[2] + ')' }, g);
    [[0, 0, 22], [24, -8, 26], [52, 0, 20], [26, 8, 22]].forEach(function (b) { el('circle', { cx: b[0], cy: b[1], r: b[2] }, inner); });
  });

  // overlay: radio rings, smoke, bubbles, labels, birds
  var rings = [0, 1].map(function (k) {
    var e = el('ellipse', { 'class': 'ring', rx: 6, ry: 3.5 }, over);
    if (!reduce) e.innerHTML = '<animate attributeName="rx" values="6;46" dur="2.6s" begin="' + (k * 1.3) + 's" repeatCount="indefinite"/>' +
      '<animate attributeName="ry" values="3.5;24" dur="2.6s" begin="' + (k * 1.3) + 's" repeatCount="indefinite"/>' +
      '<animate attributeName="opacity" values=".9;0" dur="2.6s" begin="' + (k * 1.3) + 's" repeatCount="indefinite"/>';
    return e;
  });
  var puffs = [];
  for (var p = 0; p < 7; p++) puffs.push(el('circle', { 'class': 'smoke', r: 4 }, over));

  function bubble(text, err) {
    var g = el('g', { 'class': 'bubble' }, over);
    var w = err ? 128 : 112;
    el('path', { d: 'M' + (-w / 2) + ',-46 h' + w + ' a10,10 0 0 1 10,10 v14 a10,10 0 0 1 -10,10 h' + (-w / 2 + 16) +
      ' l-10,12 l-4,-12 h' + (-w / 2 - 2) + ' a10,10 0 0 1 -10,-10 v-14 a10,10 0 0 1 10,-10z' }, g);
    var t = el('text', { x: 5, y: -24, 'text-anchor': 'middle' }, g);
    t.innerHTML = text + (err ? '<tspan class="err">' + err + '</tspan>' : '');
    return g;
  }
  var bubHome = bubble("hi, i'm alex"), bubSchool = bubble("hi, i'm ", 'a lax');

  var labels = {};
  objects.forEach(function (o) {
    if (!o.station) return;
    var g = el('g', { 'class': 'lbl' }, over), w = o.station.name.length * 8.1 + 26;
    el('rect', { x: -w / 2, y: -30, width: w, height: 24, rx: 12 }, g);
    var t = el('text', { x: 0, y: -13, 'text-anchor': 'middle' }, g);
    t.textContent = o.station.name;
    labels[o.id] = { g: g, o: o };
  });
  var birds = [0, 1, 2].map(function () { return el('path', { 'class': 'bird', d: 'M-7,0 Q-3.5,-5 0,0 Q3.5,-5 7,0' }, over); });

  // dynamic movers
  var seed = 3;
  function rnd2() { seed = (seed * 48271) % 2147483647; return seed / 2147483647; }
  var cars = [['W', 'NW', 'coral'], ['E', 'SE', 'amber'], ['N', 'NE', 'teal'], ['S', 'SW', 'white'], ['C', 'W', 'plum']].map(function (c, k) {
    var m = new Mover(c[0], c[1], 1.55 + k * 0.12, 0.3, rnd2);
    m.m = c[2]; m.g = el('g', { 'class': 'car' }, layer);
    for (var s = 0; s < k * 3; s++) m.step(0.4);
    return m;
  });
  var dots = [0, 1, 2, 3, 4, 5].map(function (k) {
    var starts = [['NW', 'W'], ['SE', 'S'], ['C', 'N'], ['NE', 'E'], ['SW', 'S'], ['C', 'E']][k];
    var m = new Mover(starts[0], starts[1], 3.0, 0, rnd2);
    m.g = el('g', { 'class': 'dot' }, layer);
    m.c = el('circle', { 'class': 'pulse', r: 4.2 }, m.g);
    return m;
  });

  var theta = 0, target = 0, tween = null;
  var depthList = [];
  function renderStatic() {
    setAngle(theta);
    ground.innerHTML = groundSVG();
    // detach movers, rebuild objects, re-attach
    cars.concat(dots).forEach(function (m) { if (m.g.parentNode) m.g.parentNode.removeChild(m.g); });
    layer.innerHTML = staticSVG();
    depthList = Array.prototype.slice.call(layer.children).map(function (e) { return { d: parseFloat(e.getAttribute('data-depth')), e: e }; });
    cars.concat(dots).forEach(function (m) { layer.appendChild(m.g); });
    winEls = {};
    Array.prototype.forEach.call(layer.querySelectorAll('[data-w]'), function (e) { winEls[e.getAttribute('data-w')] = e; });
    // overlay positions
    var top = P(4.36, 2.81, 4.95);
    rings.forEach(function (r) { r.setAttribute('cx', top[0].toFixed(1)); r.setAttribute('cy', top[1].toFixed(1)); });
    var h = P(3.0, 10.3, 3.45), s = P(11.6, 10.9, 2.3);
    // keep speech bubbles clear of the interests signpost in the roundabout
    function clear(b) {
      var c = P(8, 8, 2.4), dx = b[0] - c[0], dy = b[1] - 30 - c[1], d = Math.sqrt(dx * dx + dy * dy) || 1, MIN = 120;
      if (d < MIN) { b[0] = c[0] + dx / d * MIN; b[1] = c[1] + dy / d * MIN + 30; }
      return b;
    }
    h = clear(h); s = clear(s);
    bubHome.setAttribute('transform', 'translate(' + h[0].toFixed(1) + ',' + h[1].toFixed(1) + ')');
    bubSchool.setAttribute('transform', 'translate(' + s[0].toFixed(1) + ',' + s[1].toFixed(1) + ')');
    for (var id in labels) {
      var a = labels[id].o.station.anchor, q = P(a[0], a[1], a[2]);
      labels[id].g.setAttribute('transform', 'translate(' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ')');
    }
  }
  var winEls = {};

  function placeMover(m) {
    var d = depthXY(m.x, m.y), ref = null;
    for (var i = 0; i < depthList.length; i++) { if (depthList[i].d > d) { ref = depthList[i].e; break; } }
    if (m.g.nextSibling !== ref) layer.insertBefore(m.g, ref);
  }
  function drawMovers() {
    cars.forEach(function (c) { c.g.innerHTML = carSVG(c); placeMover(c); });
    dots.forEach(function (m) {
      var q = P(m.x, m.y, 0.14);
      m.c.setAttribute('cx', q[0].toFixed(1)); m.c.setAttribute('cy', q[1].toFixed(1));
      placeMover(m);
    });
  }
  function drawSmoke(t) {
    puffs.forEach(function (e, k) {
      var age = ((t / 1000) * 0.32 + k / puffs.length) % 1;
      var q = P(CHIMNEY[0] - age * 0.9, CHIMNEY[1] - age * 0.25, CHIMNEY[2] + age * 1.7);
      e.setAttribute('cx', q[0].toFixed(1)); e.setAttribute('cy', q[1].toFixed(1));
      e.setAttribute('r', (3 + age * 10).toFixed(1));
      e.setAttribute('opacity', (0.62 * (1 - age)).toFixed(2));
    });
  }
  function drawBirds(t) {
    birds.forEach(function (b, k) {
      var a = t / 1000 * 0.11 + k * 0.5;
      var x = OX + Math.cos(a) * 360 + k * 18, y = 150 + Math.sin(a * 2) * 34 - k * 12;
      var flap = 0.55 + 0.45 * Math.abs(Math.sin(t / 160 + k));
      b.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(1,' + flap.toFixed(2) + ')');
    });
  }

  // window lights switching on and off
  function toggleWindows() {
    for (var k = 0; k < 3; k++) {
      var i = Math.floor(Math.random() * WIN.length);
      WIN[i] = !WIN[i];
      var e = winEls[i];
      if (e) e.setAttribute('class', WIN[i] ? 'win' : 'windark');
    }
  }

  // ---- rotation: drag, buttons
  var needStatic = true, dragging = false, moved = false, startX = 0, startTheta = 0;
  function setTheta(t) { theta = t; needStatic = true; }
  svg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; startTheta = theta; tween = null;
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 4) { moved = true; svg.classList.add('dragging'); }
    if (moved) setTheta(startTheta + dx * 0.009);
  });
  window.addEventListener('pointerup', function () {
    if (!dragging) return;
    dragging = false; svg.classList.remove('dragging');
  });
  svg.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);
  svg.addEventListener('dragstart', function (e) { e.preventDefault(); });

  function rotateTo(t) {
    if (reduce) { setTheta(t); return; }
    tween = { from: theta, to: t, start: performance.now(), dur: 650 };
  }
  var bl = document.getElementById('rotLeft'), br = document.getElementById('rotRight'), bz = document.getElementById('rotReset');
  if (bl) bl.addEventListener('click', function () { rotateTo((tween ? tween.to : theta) + Math.PI / 2); });
  if (br) br.addEventListener('click', function () { rotateTo((tween ? tween.to : theta) - Math.PI / 2); });
  if (bz) bz.addEventListener('click', function () {
    var t = theta % (Math.PI * 2);
    if (t > Math.PI) t -= Math.PI * 2; if (t < -Math.PI) t += Math.PI * 2;
    theta = t; rotateTo(0);
  });

  // ---- labels on hover / focus
  function stationOf(e) { var n = e.target; while (n && n !== svg) { if (n.classList && n.classList.contains('station')) return n; n = n.parentNode; } return null; }
  function show(id, on) { if (labels[id]) labels[id].g.classList.toggle('show', on); }
  layer.addEventListener('mouseover', function (e) { var s = stationOf(e); if (s) show(s.getAttribute('data-id'), true); });
  layer.addEventListener('mouseout', function (e) { var s = stationOf(e); if (s) show(s.getAttribute('data-id'), false); });
  layer.addEventListener('focusin', function (e) { var s = stationOf(e); if (s) show(s.getAttribute('data-id'), true); });
  layer.addEventListener('focusout', function (e) { var s = stationOf(e); if (s) show(s.getAttribute('data-id'), false); });

  // ---- main loop
  var last = performance.now(), visibleNow = true, lastToggle = 0;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visibleNow = es[0].isIntersecting; }).observe(svg);
  }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (tween) {
      var k = Math.min(1, (now - tween.start) / tween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setTheta(tween.from + (tween.to - tween.from) * e);
      if (k >= 1) tween = null;
    }
    if (needStatic) { renderStatic(); needStatic = false; }
    if (visibleNow && !document.hidden && !reduce) {
      cars.forEach(function (c) { c.step(dt); });
      dots.forEach(function (m) { m.step(dt); });
      drawSmoke(now); drawBirds(now);
      if (now - lastToggle > 800) { toggleWindows(); lastToggle = now; }
    }
    drawMovers();
    requestAnimationFrame(frame);
  }
  if (reduce) { renderStatic(); drawMovers(); drawSmoke(0); drawBirds(0); }
  requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : this);
