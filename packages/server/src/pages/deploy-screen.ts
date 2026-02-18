// ABOUTME: Black hole animation page shown while a site is deploying or waking up
// ABOUTME: Canvas-based particle physics simulation with interactive debug panel for tweaking

/**
 * Generates the black hole deploy screen HTML.
 * Used as the status page for sites that are building/deploying or waking from sleep.
 * Includes the full interactive debug panel so users can play with the physics while waiting.
 */
export function renderDeployScreen(siteName: string, statusText: string): string {
  const safeName = escapeHtml(siteName);
  const safeStatus = escapeHtml(statusText);

  // The JS uses template literals internally, so we build the HTML as a plain string
  // to avoid escaping conflicts with TypeScript template literals.
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${safeName} - ${safeStatus}</title>`,
    '<style>',
    "  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&display=swap');",
    '  * { margin: 0; padding: 0; box-sizing: border-box; }',
    '  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; cursor: none; }',
    '  canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; }',
    '',
    '  .overlay {',
    '    position: fixed; top: 0; left: 0; right: 0; bottom: 0;',
    '    display: flex; flex-direction: column; align-items: center; justify-content: center;',
    '    pointer-events: none; z-index: 10;',
    '  }',
    '  .site-name {',
    "    font-family: 'Outfit', sans-serif;",
    '    font-size: clamp(24px, 4vw, 48px);',
    '    font-weight: 600;',
    '    color: rgba(255,255,255,0.85);',
    '    text-shadow: 0 0 60px rgba(0,0,0,1), 0 0 120px rgba(0,0,0,0.8);',
    '    margin-bottom: 12px;',
    '  }',
    '  .status {',
    "    font-family: 'JetBrains Mono', monospace;",
    '    font-size: 12px;',
    '    color: rgba(255,255,255,0.3);',
    '    letter-spacing: 0.12em;',
    '    text-transform: uppercase;',
    '    text-shadow: 0 0 20px rgba(0,0,0,1);',
    '  }',
    '  .status span { animation: pulse 2s ease-in-out infinite; }',
    '  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.6; } }',
    '',
    '  .debug {',
    '    position: fixed;',
    '    top: 16px; right: 16px;',
    '    z-index: 100;',
    "    font-family: 'JetBrains Mono', monospace;",
    '    font-size: 11px;',
    '    color: #aaa;',
    '    background: rgba(0,0,0,0.75);',
    '    border: 1px solid rgba(255,255,255,0.08);',
    '    border-radius: 10px;',
    '    padding: 14px 16px;',
    '    width: 260px;',
    '    backdrop-filter: blur(12px);',
    '    -webkit-backdrop-filter: blur(12px);',
    '    cursor: default;',
    '    user-select: none;',
    '    max-height: calc(100vh - 32px);',
    '    overflow-y: auto;',
    '  }',
    '  .debug::-webkit-scrollbar { width: 4px; }',
    '  .debug::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }',
    '',
    '  .debug-header {',
    '    display: flex;',
    '    justify-content: space-between;',
    '    align-items: center;',
    '    margin-bottom: 12px;',
    '    padding-bottom: 8px;',
    '    border-bottom: 1px solid rgba(255,255,255,0.06);',
    '  }',
    '  .debug-header span {',
    '    font-size: 11px;',
    '    font-weight: 500;',
    '    color: #666;',
    '    text-transform: uppercase;',
    '    letter-spacing: 0.1em;',
    '  }',
    '  .debug-toggle {',
    '    background: none; border: 1px solid rgba(255,255,255,0.1);',
    '    color: #666; font-size: 10px; padding: 2px 8px; border-radius: 4px;',
    '    cursor: pointer; font-family: inherit;',
    '  }',
    '  .debug-toggle:hover { color: #aaa; border-color: rgba(255,255,255,0.2); }',
    '',
    '  .debug-section { margin-bottom: 12px; }',
    '  .debug-section-title {',
    '    font-size: 9px;',
    '    text-transform: uppercase;',
    '    letter-spacing: 0.15em;',
    '    color: #555;',
    '    margin-bottom: 8px;',
    '  }',
    '',
    '  .control-row {',
    '    display: flex;',
    '    align-items: center;',
    '    justify-content: space-between;',
    '    margin-bottom: 6px;',
    '    gap: 8px;',
    '  }',
    '  .control-row label { flex-shrink: 0; color: #777; font-size: 10px; }',
    '  .control-row .val { color: #999; font-size: 10px; min-width: 28px; text-align: right; flex-shrink: 0; }',
    '',
    '  input[type="range"] {',
    '    -webkit-appearance: none; appearance: none;',
    '    flex: 1; height: 3px;',
    '    background: rgba(255,255,255,0.08);',
    '    border-radius: 2px; outline: none; cursor: pointer; min-width: 0;',
    '  }',
    '  input[type="range"]::-webkit-slider-thumb {',
    '    -webkit-appearance: none;',
    '    width: 10px; height: 10px; border-radius: 50%;',
    '    background: #666; border: none; cursor: pointer;',
    '  }',
    '  input[type="range"]::-webkit-slider-thumb:hover { background: #999; }',
    '',
    '  input[type="color"] {',
    '    -webkit-appearance: none; appearance: none;',
    '    width: 24px; height: 16px;',
    '    border: 1px solid rgba(255,255,255,0.1);',
    '    border-radius: 3px; background: none; cursor: pointer; padding: 0; flex-shrink: 0;',
    '  }',
    '  input[type="color"]::-webkit-color-swatch-wrapper { padding: 1px; }',
    '  input[type="color"]::-webkit-color-swatch { border: none; border-radius: 2px; }',
    '',
    '  .debug-stats {',
    '    font-size: 9px; color: #444;',
    '    padding-top: 8px;',
    '    border-top: 1px solid rgba(255,255,255,0.04);',
    '    line-height: 1.6;',
    '  }',
    '',
    '  .debug.collapsed .debug-body { display: none; }',
    '  .debug.collapsed { width: auto; }',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="c"></canvas>',
    '<div class="overlay">',
    `  <div class="site-name">${safeName}</div>`,
    `  <div class="status"><span>${safeStatus}</span></div>`,
    '</div>',
    '',
    '<div class="debug" id="debugPanel">',
    '  <div class="debug-header">',
    '    <span>black hole</span>',
    '    <button class="debug-toggle" onclick="toggleDebug()">\u2212</button>',
    '  </div>',
    '  <div class="debug-body">',
    '',
    '    <div class="debug-section">',
    '      <div class="debug-section-title">Physics</div>',
    '      <div class="control-row">',
    '        <label>Mass</label>',
    "        <input type=\"range\" id=\"ctl-mass\" min=\"50\" max=\"600\" value=\"200\" oninput=\"cfg.gravity=+this.value; qs('#ctl-mass-v').textContent=this.value\">",
    '        <span class="val" id="ctl-mass-v">200</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Drift speed</label>',
    "        <input type=\"range\" id=\"ctl-drift\" min=\"5\" max=\"80\" value=\"20\" oninput=\"cfg.driftEase=+this.value/1000; qs('#ctl-drift-v').textContent=this.value\">",
    '        <span class="val" id="ctl-drift-v">20</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Event horizon</label>',
    "        <input type=\"range\" id=\"ctl-eh\" min=\"8\" max=\"50\" value=\"20\" oninput=\"cfg.eventHorizon=+this.value; qs('#ctl-eh-v').textContent=this.value\">",
    '        <span class="val" id="ctl-eh-v">20</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Spin direction</label>',
    "        <input type=\"range\" id=\"ctl-spin\" min=\"-100\" max=\"100\" value=\"100\" oninput=\"cfg.spinDir=+this.value/100; qs('#ctl-spin-v').textContent=(+this.value>0?'CW':'CCW')\">",
    '        <span class="val" id="ctl-spin-v">CW</span>',
    '      </div>',
    '    </div>',
    '',
    '    <div class="debug-section">',
    '      <div class="debug-section-title">Accretion Disk</div>',
    '      <div class="control-row">',
    '        <label>Particles</label>',
    "        <input type=\"range\" id=\"ctl-disk\" min=\"100\" max=\"2000\" step=\"50\" value=\"1000\" oninput=\"cfg.diskCount=+this.value; qs('#ctl-disk-v').textContent=this.value\">",
    '        <span class="val" id="ctl-disk-v">1000</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Disk tilt</label>',
    "        <input type=\"range\" id=\"ctl-tilt\" min=\"10\" max=\"90\" value=\"30\" oninput=\"cfg.diskTilt=+this.value/100; qs('#ctl-tilt-v').textContent=this.value+'\\u00b0'\">",
    '        <span class="val" id="ctl-tilt-v">30\u00b0</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Spiral tightness</label>',
    "        <input type=\"range\" id=\"ctl-spiral\" min=\"0\" max=\"100\" value=\"40\" oninput=\"cfg.spiralFactor=+this.value/100; qs('#ctl-spiral-v').textContent=this.value\">",
    '        <span class="val" id="ctl-spiral-v">40</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Doppler strength</label>',
    "        <input type=\"range\" id=\"ctl-doppler\" min=\"0\" max=\"100\" value=\"60\" oninput=\"cfg.dopplerStrength=+this.value/100; qs('#ctl-doppler-v').textContent=this.value\">",
    '        <span class="val" id="ctl-doppler-v">60</span>',
    '      </div>',
    '    </div>',
    '',
    '    <div class="debug-section">',
    '      <div class="debug-section-title">Colors</div>',
    '      <div class="control-row">',
    '        <label>Hot inner</label>',
    '        <input type="color" id="ctl-hot" value="#ffddb0" oninput="cfg.hotColor=hexToRgb(this.value)">',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Mid ring</label>',
    '        <input type="color" id="ctl-mid" value="#e89040" oninput="cfg.midColor=hexToRgb(this.value)">',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Cool outer</label>',
    '        <input type="color" id="ctl-cool" value="#5040b0" oninput="cfg.coolColor=hexToRgb(this.value)">',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Star tint</label>',
    '        <input type="color" id="ctl-star" value="#d8d8ff" oninput="cfg.starColor=hexToRgb(this.value)">',
    '      </div>',
    '    </div>',
    '',
    '    <div class="debug-section">',
    '      <div class="debug-section-title">Environment</div>',
    '      <div class="control-row">',
    '        <label>Stars</label>',
    "        <input type=\"range\" id=\"ctl-stars\" min=\"50\" max=\"800\" step=\"10\" value=\"400\" oninput=\"cfg.starCount=+this.value; qs('#ctl-stars-v').textContent=this.value; rebuildStars()\">",
    '        <span class="val" id="ctl-stars-v">400</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Ambient matter</label>',
    "        <input type=\"range\" id=\"ctl-ambient\" min=\"20\" max=\"300\" step=\"10\" value=\"150\" oninput=\"cfg.ambientCount=+this.value; qs('#ctl-ambient-v').textContent=this.value; rebuildAmbient()\">",
    '        <span class="val" id="ctl-ambient-v">150</span>',
    '      </div>',
    '      <div class="control-row">',
    '        <label>Lens strength</label>',
    "        <input type=\"range\" id=\"ctl-lens\" min=\"0\" max=\"100\" value=\"50\" oninput=\"cfg.lensStrength=+this.value; qs('#ctl-lens-v').textContent=this.value\">",
    '        <span class="val" id="ctl-lens-v">50</span>',
    '      </div>',
    '    </div>',
    '',
    '    <div class="debug-stats" id="stats"></div>',
    '  </div>',
    '</div>',
    '',
    '<script>',
    DEPLOY_SCREEN_JS,
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * The JavaScript for the black hole animation.
 * Kept as a separate constant to avoid template literal escaping issues.
 */
const DEPLOY_SCREEN_JS = `
var qs = function(s) { return document.querySelector(s); };

function hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  return [r, g, b];
}

function toggleDebug() {
  var panel = document.getElementById('debugPanel');
  panel.classList.toggle('collapsed');
  qs('.debug-toggle').textContent = panel.classList.contains('collapsed') ? '+' : '\\u2212';
}

var cfg = {
  gravity: 200,
  driftEase: 0.02,
  eventHorizon: 20,
  spinDir: 1,
  diskCount: 1000,
  diskTilt: 0.30,
  spiralFactor: 0.4,
  dopplerStrength: 0.6,
  hotColor: [255, 221, 176],
  midColor: [232, 144, 64],
  coolColor: [80, 64, 176],
  starColor: [216, 216, 255],
  starCount: 400,
  ambientCount: 150,
  lensStrength: 50
};

var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d');
var W, H;

function resize() {
  W = canvas.width = window.innerWidth * devicePixelRatio;
  H = canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  W /= devicePixelRatio; H /= devicePixelRatio;
}
resize();

var mx = W / 2, my = H / 2;
var bhx = W / 2, bhy = H / 2;
var hasMoved = false;

document.addEventListener('mousemove', function(e) { mx = e.clientX; my = e.clientY; hasMoved = true; });
document.addEventListener('touchmove', function(e) {
  e.preventDefault();
  mx = e.touches[0].clientX; my = e.touches[0].clientY; hasMoved = true;
}, { passive: false });
document.addEventListener('touchstart', function(e) {
  mx = e.touches[0].clientX; my = e.touches[0].clientY; hasMoved = true;
});

var stars = [];
function rebuildStars() {
  stars = [];
  for (var i = 0; i < cfg.starCount; i++) {
    stars.push({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      size: Math.random() * 1.6 + 0.2,
      brightness: Math.random() * 0.5 + 0.15,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.03 + 0.008
    });
  }
}
rebuildStars();

var diskParticles = [];
var currentDiskCount = 0;

function makeDiskParticle(idx) {
  var angle = (idx / cfg.diskCount) * Math.PI * 2 * 5 + Math.random() * 0.5;
  var baseR = 25 + Math.random() * 190;
  var spiralAngle = angle + (baseR / 200) * cfg.spiralFactor * Math.PI * 2;
  var orbSpeed = (0.6 + Math.random() * 1.0) / Math.sqrt(baseR / 50) * cfg.spinDir;
  return {
    angle: spiralAngle,
    orbitR: baseR,
    angularVel: orbSpeed * 0.01,
    x: 0, y: 0,
    size: Math.random() * 2.2 + 0.3,
    temp: 0,
    spiralPhase: Math.random() * Math.PI * 2,
    radialDrift: (Math.random() - 0.5) * 0.02
  };
}

function rebuildDisk() {
  diskParticles = [];
  for (var i = 0; i < cfg.diskCount; i++) {
    diskParticles.push(makeDiskParticle(i));
  }
  currentDiskCount = cfg.diskCount;
}
rebuildDisk();

var ambient = [];
function respawnAmbient(i, initial) {
  var edge = Math.floor(Math.random() * 4);
  var x, y;
  if (initial) {
    x = Math.random() * W;
    y = Math.random() * H;
  } else {
    x = edge === 0 ? -40 : edge === 2 ? W + 40 : Math.random() * W;
    y = edge === 1 ? -40 : edge === 3 ? H + 40 : Math.random() * H;
  }
  ambient[i] = {
    x: x, y: y,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: Math.random() * 1.5 + 0.5
  };
}
function rebuildAmbient() {
  ambient = [];
  for (var i = 0; i < cfg.ambientCount; i++) {
    respawnAmbient(i, true);
  }
}
rebuildAmbient();

var t = 0;
var accretionIntensity = 0.25;
var ringPulse = 0;
var absorbed = 0;
var fps = 0;
var lastFpsTime = performance.now();
var framesSinceFps = 0;

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function rgb(c, a) {
  if (a !== undefined) return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  bhx += (mx - bhx) * cfg.driftEase;
  bhy += (my - bhy) * cfg.driftEase;
  if (!hasMoved) {
    bhx = W / 2 + Math.sin(t * 0.15) * 70;
    bhy = H / 2 + Math.cos(t * 0.12) * 50;
  }

  var EH = cfg.eventHorizon;
  var tilt = cfg.diskTilt;

  if (currentDiskCount !== cfg.diskCount) {
    if (cfg.diskCount > currentDiskCount) {
      for (var i = currentDiskCount; i < cfg.diskCount; i++) {
        diskParticles.push(makeDiskParticle(i));
      }
    } else {
      diskParticles.length = cfg.diskCount;
    }
    currentDiskCount = cfg.diskCount;
  }

  var lensR = 150 + cfg.lensStrength * 2;
  var lensStr = cfg.lensStrength * 0.8;

  for (var si = 0; si < stars.length; si++) {
    var s = stars[si];
    var sx = (s.x + 1) * 0.5 * W;
    var sy = (s.y + 1) * 0.5 * H;
    var sdx = sx - bhx;
    var sdy = sy - bhy;
    var sdist = Math.sqrt(sdx * sdx + sdy * sdy);

    if (sdist < lensR && sdist > 10) {
      var factor = (1 - sdist / lensR);
      var push = factor * factor * lensStr;
      var angle = Math.atan2(sdy, sdx);
      sx += Math.cos(angle) * push;
      sy += Math.sin(angle) * push;
      sx += Math.sin(angle) * push * 0.15;
      sy -= Math.cos(angle) * push * 0.15;
    }

    var fd = Math.sqrt((sx - bhx) * (sx - bhx) + (sy - bhy) * (sy - bhy));
    if (fd < EH + 2) continue;

    s.phase += s.speed;
    var twinkle = 0.65 + Math.sin(s.phase) * 0.35;
    ctx.globalAlpha = s.brightness * twinkle;
    ctx.fillStyle = rgb(cfg.starColor);
    ctx.beginPath();
    ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
    ctx.fill();
  }

  var behindDisk = [];
  var frontDisk = [];

  for (var di = 0; di < diskParticles.length; di++) {
    var p = diskParticles[di];
    p.angle += p.angularVel;
    p.orbitR += p.radialDrift;
    if (p.orbitR < 15) {
      p.orbitR = 140 + Math.random() * 60;
      p.angle = Math.random() * Math.PI * 2;
      accretionIntensity = Math.min(1, accretionIntensity + 0.001);
      ringPulse = Math.min(1, ringPulse + 0.15);
      absorbed++;
    }
    if (p.orbitR > 220) p.radialDrift = -Math.abs(p.radialDrift);
    if (p.orbitR < 30) p.radialDrift = Math.abs(p.radialDrift) * 0.5;

    var spiralR = p.orbitR + Math.sin(p.angle * 3 + p.spiralPhase) * p.orbitR * cfg.spiralFactor * 0.15;
    p.x = Math.cos(p.angle) * spiralR;
    p.y = Math.sin(p.angle) * spiralR * tilt;
    p.temp = Math.max(0, Math.min(1, 1 - p.orbitR / 200));

    if (p.y < 0) behindDisk.push(p);
    else frontDisk.push(p);
  }

  drawDiskParticles(behindDisk);

  var ringGlow = 0.2 + accretionIntensity * 0.7 + ringPulse * 0.25;
  ringPulse *= 0.96;

  for (var ri = 6; ri >= 0; ri--) {
    var r = EH + 2 + ri * 7;
    var intensity = (1 - ri / 6);
    var alpha = ringGlow * (0.02 + intensity * 0.035) * accretionIntensity;
    var col = lerpColor(cfg.coolColor, cfg.hotColor, intensity);
    var grad = ctx.createRadialGradient(bhx, bhy, Math.max(0, r - 5), bhx, bhy, r + 5);
    grad.addColorStop(0, rgb(col, 0));
    grad.addColorStop(0.5, rgb(col, alpha));
    grad.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bhx, bhy, r + 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = ringGlow * 0.7;
  ctx.strokeStyle = rgb(cfg.hotColor, ringGlow * 0.5);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(bhx, bhy, EH + 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = ringGlow * 0.35;
  ctx.strokeStyle = rgb([255, 245, 230], ringGlow * 0.25);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(bhx, bhy, EH + 1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(bhx, bhy, EH, 0, Math.PI * 2);
  ctx.fill();

  drawDiskParticles(frontDisk);

  for (var ai = 0; ai < ambient.length; ai++) {
    var a = ambient[ai];
    if (!a) continue;
    var dx = bhx - a.x;
    var dy = bhy - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) {
      var force = cfg.gravity * 1.5 / (dist * dist);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      a.vx += (dy / dist) * force * 0.3 * cfg.spinDir;
      a.vy -= (dx / dist) * force * 0.3 * cfg.spinDir;
    }

    var speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (speed > 6) { a.vx = (a.vx / speed) * 6; a.vy = (a.vy / speed) * 6; }

    a.vx *= 0.999;
    a.vy *= 0.999;
    a.x += a.vx;
    a.y += a.vy;

    if (dist < EH + 5) {
      accretionIntensity = Math.min(1, accretionIntensity + 0.004);
      ringPulse = Math.min(1, ringPulse + 0.25);
      absorbed++;
      respawnAmbient(ai, false);
      continue;
    }

    if (a.x < -100 || a.x > W + 100 || a.y < -100 || a.y > H + 100) {
      respawnAmbient(ai, false);
      continue;
    }

    var temp = Math.max(0, 1 - dist / 350);
    var col = lerpColor(cfg.coolColor, cfg.midColor, temp);
    var alpha = Math.min(0.8, 0.08 + speed * 0.12 + temp * 0.35);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.size * (0.5 + temp * 0.6), 0, Math.PI * 2);
    ctx.fill();

    if (speed > 1.2) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.lineWidth = a.size * 0.5;
      ctx.strokeStyle = rgb(col);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - a.vx * 4, a.y - a.vy * 4);
      ctx.stroke();
    }
  }

  if (hasMoved) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx, my, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(mx, my, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  accretionIntensity = Math.max(0.1, accretionIntensity - 0.0002);
  ctx.globalAlpha = 1;
  t += 0.016;

  framesSinceFps++;
  var now = performance.now();
  if (now - lastFpsTime > 500) {
    fps = Math.round(framesSinceFps / ((now - lastFpsTime) / 1000));
    framesSinceFps = 0;
    lastFpsTime = now;
    var statsEl = qs('#stats');
    if (statsEl) {
      statsEl.textContent = fps + ' fps \\u00b7 ' + (diskParticles.length + ambient.length + stars.length) + ' objects \\u00b7 ' + absorbed + ' absorbed \\u00b7 intensity ' + accretionIntensity.toFixed(2);
    }
  }

  requestAnimationFrame(draw);
}

function drawDiskParticles(particles) {
  ctx.globalCompositeOperation = 'lighter';

  for (var pi = 0; pi < particles.length; pi++) {
    var p = particles[pi];
    var screenX = bhx + p.x;
    var screenY = bhy + p.y;
    var temp = p.temp;
    var col;
    if (temp < 0.35) {
      col = lerpColor(cfg.coolColor, cfg.midColor, temp / 0.35);
    } else if (temp < 0.7) {
      col = lerpColor(cfg.midColor, cfg.hotColor, (temp - 0.35) / 0.35);
    } else {
      var t2 = (temp - 0.7) / 0.3;
      col = lerpColor(cfg.hotColor, [255, 250, 240], t2);
    }

    var tangentialVel = Math.cos(p.angle) * cfg.spinDir;
    var dopplerFactor = 1 + tangentialVel * cfg.dopplerStrength * 0.6;
    var dopplerBoosted = [
      Math.min(255, Math.round(col[0] * dopplerFactor)),
      Math.min(255, Math.round(col[1] * dopplerFactor)),
      Math.min(255, Math.round(col[2] * dopplerFactor))
    ];

    var alpha = Math.min(0.75,
      (0.04 + temp * 0.35 + Math.abs(p.angularVel) * 8)
      * accretionIntensity
      * Math.max(0.3, dopplerFactor)
    );

    var drawSize = p.size * (0.4 + temp * 1.2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb(dopplerBoosted);
    ctx.beginPath();
    ctx.arc(screenX, screenY, drawSize, 0, Math.PI * 2);
    ctx.fill();

    if (temp > 0.4) {
      ctx.globalAlpha = alpha * 0.15 * dopplerFactor;
      ctx.beginPath();
      ctx.arc(screenX, screenY, drawSize * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}

draw();
window.addEventListener('resize', resize);
`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
