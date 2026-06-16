import { useState, useEffect, useRef, useCallback } from "react";

// ---------- color engine ----------
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx === 0 ? 0 : d / mx, mx];
}
function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360; const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}
function hueRotate(r, g, b, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928),
    r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.14) + b * (0.072 - c * 0.072 - s * 0.283),
    r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072),
  ];
}
function applyPreset(R, G, B, p) {
  if (p === "ITU-709") return [R, G, B];
  let [h, s, v] = rgb2hsv(R, G, B);
  if (p === "HIGH-SAT") s *= 1.3; else if (p === "STD") s *= 1.08;
  else if (p === "CINEMA") { s *= 0.78; v = v * 0.96 + 0.02; }
  else if (p === "FL-LIGHT" && h > 70 && h < 175) h += 9;
  return hsv2rgb(h, Math.min(1, s), c01(v));
}
function applyUser(R, G, B, st) {
  if (st.phase !== 0) [R, G, B] = hueRotate(R, G, B, (st.phase / 99) * 30);
  const k = 0.75;
  const nR = R + k * ((st.rg / 100) * (R - G) + (st.rb / 100) * (R - B));
  const nG = G + k * ((st.gr / 100) * (G - R) + (st.gb / 100) * (G - B));
  const nB = B + k * ((st.br / 100) * (B - R) + (st.bg / 100) * (B - G));
  R = nR; G = nG; B = nB;
  if (st.level !== 0) { const sat = 1 + st.level / 120, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B; R = Y + (R - Y) * sat; G = Y + (G - Y) * sat; B = Y + (B - Y) * sat; }
  return [R, G, B];
}
const SW = 396, SH = 222;
function drawBars(ctx) {
  const bars = [[191, 191, 191], [191, 191, 0], [0, 191, 191], [0, 191, 0], [191, 0, 191], [191, 0, 0], [0, 0, 191]];
  const bw = SW / 7, t = SH * 0.8; bars.forEach((c, i) => { ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(i * bw, 0, bw + 1, t); });
  for (let x = 0; x < SW; x++) { const vv = Math.round((x / SW) * 220); ctx.fillStyle = `rgb(${vv},${vv},${vv})`; ctx.fillRect(x, t, 1, SH - t); }
}
function drawScene(ctx) {
  let g = ctx.createLinearGradient(0, 0, 0, SH * 0.46); g.addColorStop(0, "rgb(108,158,216)"); g.addColorStop(1, "rgb(176,206,228)"); ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH * 0.46);
  g = ctx.createLinearGradient(0, SH * 0.4, 0, SH); g.addColorStop(0, "rgb(120,138,150)"); g.addColorStop(1, "rgb(86,100,112)"); ctx.fillStyle = g; ctx.fillRect(0, SH * 0.46, SW, SH * 0.54);
  ctx.fillStyle = "rgb(60,72,96)"; ctx.beginPath(); ctx.moveTo(SW / 2 - 70, SH); ctx.quadraticCurveTo(SW / 2, SH * 0.52, SW / 2 + 70, SH); ctx.fill();
  ctx.fillStyle = "rgb(228,182,152)"; ctx.beginPath(); ctx.arc(SW / 2, SH * 0.58, 34, 0, 7); ctx.fill();
  ctx.fillStyle = "rgb(74,54,42)"; ctx.beginPath(); ctx.arc(SW / 2, SH * 0.50, 30, Math.PI, 0); ctx.fill();
  ["rgb(196,52,48)", "rgb(228,158,46)", "rgb(72,150,84)", "rgb(64,120,200)"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(14 + i * 30, 14, 24, 24); });
}

const fSans = "'Hanken Grotesk','Noto Sans TC',sans-serif";
const fMono = "'IBM Plex Mono',monospace";
const PRESETS = ["ITU-709", "STD", "HIGH-SAT", "FL-LIGHT", "CINEMA"];
const LOOKS = [
  { id: "自然", en: "Natural", sw: "linear-gradient(135deg,#8a8f93,#c7ccd0)", p: { preset: "ITU-709", level: 0, phase: 0, rg: 0, rb: 0, gr: 0, gb: 0, br: 0, bg: 0 } },
  { id: "標準", en: "Standard", sw: "linear-gradient(135deg,#9a8a6e,#d8c49a)", p: { preset: "STD", level: 6, phase: 0, rg: 4, rb: 0, gr: 0, gb: 0, br: 0, bg: 0 } },
  { id: "鮮豔", en: "Vivid", sw: "linear-gradient(135deg,#ff5a4d,#3a8dff,#3ad07f)", p: { preset: "HIGH-SAT", level: 20, phase: 0, rg: 8, rb: 4, gr: -6, gb: 6, br: 0, bg: -6 } },
  { id: "暖調", en: "Warm", sw: "linear-gradient(135deg,#ff8a3d,#ffd08a)", p: { preset: "ITU-709", level: 5, phase: 8, rg: 12, rb: 2, gr: 0, gb: -4, br: 8, bg: 0 } },
  { id: "冷調", en: "Cool", sw: "linear-gradient(135deg,#4d8aff,#9ad0ff)", p: { preset: "ITU-709", level: 3, phase: -8, rg: 0, rb: 10, gr: 0, gb: 2, br: 4, bg: -6 } },
  { id: "螢光燈補償", en: "FL-comp", sw: "linear-gradient(135deg,#7fb86a,#cfe0a0)", p: { preset: "FL-LIGHT", level: 3, phase: 2, rg: 4, rb: 0, gr: -8, gb: -10, br: 0, bg: -6 } },
  { id: "電影感", en: "Cinema", sw: "linear-gradient(135deg,#3d6b73,#caa178)", p: { preset: "CINEMA", level: -8, phase: -3, rg: 6, rb: -4, gr: 0, gb: 4, br: -8, bg: -6 } },
];
const AXES = [["rg", "R-G", "紅 → 綠"], ["rb", "R-B", "紅 → 藍"], ["gr", "G-R", "綠 → 紅"], ["gb", "G-B", "綠 → 藍"], ["br", "B-R", "藍 → 紅"], ["bg", "B-G", "藍 → 綠"]];
const SCOPES = [["vector", "向量"], ["wave", "波形"], ["hist", "直方圖"]];
const SCOPE_HINT = { vector: "色點分布 — 對齊色靶,虛線為膚色參考", wave: "亮度分布 — 縱軸 0–100%", hist: "明暗 / 色版分布" };

// ---------- SONY panel ----------
const S = { navy: "#0c1f33", navy2: "#0e2740", header: "#1d77c4", text: "#dfe8ee", dim: "#7f97a8", val: "#ffd45e", cyan: "#1ec8d6", line: "rgba(120,170,210,0.18)", green: "#3ff07f" };
const SonyRow = ({ id, label, children, indent = 0, dim, sel, setSel }) => (
  <div onClick={() => id && setSel(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px " + (10 + indent * 14) + "px", cursor: id ? "pointer" : "default", borderLeft: "2px solid " + (sel === id ? S.cyan : "transparent"), background: sel === id ? "rgba(30,200,214,0.10)" : "transparent" }}>
    <span style={{ width: 10, color: S.cyan, fontSize: 11 }}>{sel === id ? "\u25B6" : ""}</span>
    <span style={{ flex: 1, fontSize: 12, letterSpacing: 0.5, color: dim ? S.dim : S.text, fontFamily: fMono }}>{label}</span>
    {children}
  </div>
);

const SonyTog = ({ on, t }) => (
  <button onClick={(e) => { e.stopPropagation(); t(); }} style={{ fontFamily: fMono, fontSize: 12, fontWeight: 600, width: 60, textAlign: "right", background: "none", border: "none", cursor: "pointer", color: on ? S.green : S.dim }}>
    {on ? "ON" : "OFF"}
  </button>
);

const SonyNum = ({ id, accent, st, upd }) => (
  <div style={{ width: 180, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
    <input 
      type="range" 
      min={-99} 
      max={99} 
      value={st[id]} 
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onChange={(e) => upd(id, parseInt(e.target.value))} 
      className="cm-sn" 
      style={{ "--a": accent || S.cyan, width: 136 }} 
    />
    <span style={{ fontFamily: fMono, fontSize: 12, fontWeight: 600, width: 32, textAlign: "right", color: st[id] === 0 ? S.dim : (accent || S.val) }}>
      {st[id] > 0 ? "+" + st[id] : st[id]}
    </span>
  </div>
);

function SonyPanel({ st, upd, sel, setSel }) {
  return (
    <div style={{ background: `linear-gradient(180deg,${S.navy2},${S.navy})`, border: `1px solid ${S.line}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ background: S.header, padding: "6px 12px", fontSize: 12, fontWeight: 700, letterSpacing: 1.5, fontFamily: fMono, color: "#fff" }}>{"< PAINT · MATRIX >"}</div>
      <div style={{ padding: "4px 0" }}>
        <SonyRow id="bl" label="BASE LOOK" sel={sel} setSel={setSel}>
          <span style={{ fontFamily: fMono, fontSize: 12, color: S.dim, width: 110, textAlign: "right" }}>709 / S-Cinetone</span>
        </SonyRow>
        <div style={{ height: 1, background: S.line, margin: "3px 0" }} />
        <SonyRow id="matrix" label="MATRIX" sel={sel} setSel={setSel}>
          <SonyTog on={st.matrix} t={() => upd("matrix", !st.matrix)} />
        </SonyRow>
        <SonyRow id="adaptive" label="ADAPTIVE MATRIX" sel={sel} setSel={setSel}>
          <SonyTog on={st.adaptive} t={() => upd("adaptive", !st.adaptive)} />
        </SonyRow>
        <SonyRow id="presetSel" label="PRESET MATRIX" sel={sel} setSel={setSel}>
          <button onClick={(e) => { e.stopPropagation(); const i = PRESETS.indexOf(st.preset); upd("preset", PRESETS[(i + 1) % PRESETS.length]); }} style={{ fontFamily: fMono, fontSize: 12, fontWeight: 600, width: 110, textAlign: "right", background: "none", border: "none", cursor: "pointer", color: S.cyan }}>
            {"\u25C0 " + st.preset}
          </button>
        </SonyRow>
        <div style={{ height: 1, background: S.line, margin: "3px 0" }} />
        <SonyRow id="lbl" label="USER MATRIX" dim sel={sel} setSel={setSel}>
          <span style={{ fontFamily: fMono, fontSize: 10, color: S.dim }}>ON</span>
        </SonyRow>
        <SonyRow id="level" label="LEVEL" indent={1} sel={sel} setSel={setSel}>
          <SonyNum id="level" accent="#ffb340" st={st} upd={upd} />
        </SonyRow>
        <SonyRow id="phase" label="PHASE" indent={1} sel={sel} setSel={setSel}>
          <SonyNum id="phase" accent="#7fb6ff" st={st} upd={upd} />
        </SonyRow>
        {AXES.map(([k, l]) => (
          <SonyRow key={k} id={k} label={l} indent={1} sel={sel} setSel={setSel}>
            <SonyNum id={k} st={st} upd={upd} />
          </SonyRow>
        ))}
      </div>
    </div>
  );
}

// ---------- AVER panel ----------
const A = { panel: "#1f232a", line: "#2f3642", line2: "#3e4654", text: "#eceef0", dim: "#8b9298", faint: "#5b626a", accent: "#ff6a3d", accentBg: "rgba(255,106,61,0.12)", cool: "#5aa8ff" };
function AvFSlider({ k, label, hint, val, accent, upd }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: fSans, fontSize: 13, color: A.text }}>{label} {hint && <span style={{ color: A.faint, fontSize: 11 }}>· {hint}</span>}</span>
        <span style={{ fontFamily: fMono, fontSize: 12, fontWeight: 600, color: val === 0 ? A.faint : (accent || A.accent) }}>{val > 0 ? "+" + val : val}</span>
      </div>
      <input type="range" min={-99} max={99} step={1} value={val} onChange={(e) => upd(k, parseInt(e.target.value))} className="cm-av" style={{ "--p": ((val + 99) / 198) * 100 + "%", "--a": accent || A.accent }} />
    </div>
  );
}
function AverPanel({ st, upd, look, pickLook, adv, setAdv, resetAdv }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: A.dim, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>風格</span>{!look ? <span style={{ color: A.accent }}>已修改 · 自訂</span> : <span style={{ color: A.faint }}>{look}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 8, marginBottom: 20 }}>
        {LOOKS.map((l) => (
          <button key={l.id} onClick={() => pickLook(l)} style={{ padding: 0, cursor: "pointer", borderRadius: 8, overflow: "hidden", textAlign: "left", border: `1px solid ${look === l.id ? A.accent : A.line}`, background: A.panel, outline: look === l.id ? `2px solid ${A.accentBg}` : "none" }}>
            <div style={{ height: 28, background: l.sw }} />
            <div style={{ padding: "5px 7px" }}><div style={{ fontSize: 12, color: look === l.id ? A.accent : A.text, fontWeight: 500 }}>{l.id}</div><div style={{ fontFamily: fMono, fontSize: 9, color: A.faint }}>{l.en}</div></div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", background: "#0e1013", border: `1px solid ${A.line}`, borderRadius: 8, padding: 3, gap: 4, marginBottom: 16 }}>
        <button onClick={() => setAdv(false)} style={{ flex: 1, padding: "8px", fontSize: 12, fontWeight: 500, fontFamily: fSans, cursor: "pointer", borderRadius: 6, border: "none", background: !adv ? A.accent : "transparent", color: !adv ? "#fff" : A.dim }}>
          基本調整
        </button>
        <button onClick={() => setAdv(true)} style={{ flex: 1, padding: "8px", fontSize: 12, fontWeight: 500, fontFamily: fSans, cursor: "pointer", borderRadius: 6, border: "none", background: adv ? A.accent : "transparent", color: adv ? "#fff" : A.dim }}>
          進階色彩矩陣
        </button>
      </div>

      <div style={{ minHeight: "380px" }}>
        {!adv ? (
          <div style={{ paddingTop: 8 }}>
            <AvFSlider k="level" label="飽和度" hint="整體濃淡" val={st.level} accent={A.accent} upd={upd} />
            <AvFSlider k="phase" label="色相" hint="整體偏移" val={st.phase} accent={A.cool} upd={upd} />
          </div>
        ) : (
          <div style={{ padding: "12px 12px 2px", background: A.panel, border: `1px solid ${A.line}`, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: A.faint, lineHeight: 1.5, flex: 1, paddingRight: 10 }}>六個色差軸，微調單一通道間關係。建議搭配示波器小幅調整。</span>
              <button onClick={resetAdv} style={{ fontSize: 10, color: A.dim, background: "none", border: `1px solid ${A.line2}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>歸零</button>
            </div>
            {AXES.map(([k, lb, hint]) => <AvFSlider key={k} k={k} label={lb} hint={hint} val={st[k]} accent={A.text} upd={upd} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("sony");
  const [st, setSt] = useState({ matrix: true, adaptive: false, ...LOOKS[0].p });
  const [look, setLook] = useState("自然");
  const [sel, setSel] = useState("level");
  const [adv, setAdv] = useState(false);
  const [source, setSource] = useState("scene");
  const [scope, setScope] = useState("vector");
  const [bypass, setBypass] = useState(false);
  const preRef = useRef(null), scRef = useRef(null), baseRef = useRef(null), fileRef = useRef(null), imgRef = useRef(null);

  const upd = useCallback((k, v) => { setSt((s) => ({ ...s, [k]: v })); setLook(null); }, []);
  const pickLook = (l) => { setSt((s) => ({ ...s, ...l.p })); setLook(l.id); };
  const reset = () => { setSt({ matrix: true, adaptive: false, ...LOOKS[0].p }); setLook("自然"); };
  const resetAdv = () => { setSt((s) => ({ ...s, rg: 0, rb: 0, gr: 0, gb: 0, br: 0, bg: 0 })); setLook(null); };

  useEffect(() => {
    const cv = document.createElement("canvas"); cv.width = SW; cv.height = SH; const ctx = cv.getContext("2d");
    if (source === "upload" && imgRef.current) { const im = imgRef.current, r = Math.max(SW / im.width, SH / im.height); ctx.drawImage(im, (SW - im.width * r) / 2, (SH - im.height * r) / 2, im.width * r, im.height * r); }
    else if (source === "bars") drawBars(ctx); else drawScene(ctx);
    baseRef.current = ctx.getImageData(0, 0, SW, SH);
  }, [source]);

  useEffect(() => {
    const base = baseRef.current, cvs = preRef.current, sc = scRef.current;
    if (!base || !cvs || !sc) return;

    let active = true;
    let rAFId;

    const render = () => {
      if (!active) return;
      
      const ctx = cvs.getContext("2d");
      const out = ctx.createImageData(SW, SH);
      const sd = base.data;
      const dd = out.data;

      // 預先計算色彩轉換參數，避免在大迴圈中重複運算
      const usePreset = !bypass && st.matrix ? st.preset : null;
      const applyUserMatrix = !bypass && st.matrix;
      
      // hueRotate 常數
      let cosA = 1, sinA = 0;
      const rotateHue = applyUserMatrix && st.phase !== 0;
      if (rotateHue) {
        const a = ((st.phase / 99) * 30 * Math.PI) / 180;
        cosA = Math.cos(a);
        sinA = Math.sin(a);
      }

      // matrix 常數
      const k = 0.75;
      const k_rg = applyUserMatrix ? k * (st.rg / 100) : 0;
      const k_rb = applyUserMatrix ? k * (st.rb / 100) : 0;
      const k_gr = applyUserMatrix ? k * (st.gr / 100) : 0;
      const k_gb = applyUserMatrix ? k * (st.gb / 100) : 0;
      const k_br = applyUserMatrix ? k * (st.br / 100) : 0;
      const k_bg = applyUserMatrix ? k * (st.bg / 100) : 0;

      // level (saturation) 常數
      const applyLevel = applyUserMatrix && st.level !== 0;
      const sat = applyLevel ? 1 + st.level / 120 : 1;

      // 迴圈處理像素
      for (let i = 0; i < sd.length; i += 4) {
        let R = sd[i] / 255;
        let G = sd[i + 1] / 255;
        let B = sd[i + 2] / 255;

        // 1. Preset
        if (usePreset && usePreset !== "ITU-709") {
          // rgb2hsv
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
          let h = 0;
          if (d) {
            if (mx === R) h = ((G - B) / d) % 6;
            else if (mx === G) h = (B - R) / d + 2;
            else h = (R - G) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
          }
          let s = mx === 0 ? 0 : d / mx;
          let v = mx;

          // applyPreset
          if (usePreset === "HIGH-SAT") s *= 1.3;
          else if (usePreset === "STD") s *= 1.08;
          else if (usePreset === "CINEMA") { s *= 0.78; v = v * 0.96 + 0.02; }
          else if (usePreset === "FL-LIGHT" && h > 70 && h < 175) h += 9;

          // hsv2rgb
          h = ((h % 360) + 360) % 360;
          const c = v * (s < 0 ? 0 : s > 1 ? 1 : s);
          const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
          const m = v - c;
          let r = 0, g = 0, b = 0;
          if (h < 60) { r = c; g = x; }
          else if (h < 120) { r = x; g = c; }
          else if (h < 180) { g = c; b = x; }
          else if (h < 240) { g = x; b = c; }
          else if (h < 300) { r = x; b = c; }
          else { r = c; b = x; }
          R = r + m; G = g + m; B = b + m;
        }

        // 2. User Matrix
        if (applyUserMatrix) {
          if (rotateHue) {
            const r = R, g = G, b = B;
            R = r * (0.213 + cosA * 0.787 - sinA * 0.213) + g * (0.715 - cosA * 0.715 - sinA * 0.715) + b * (0.072 - cosA * 0.072 + sinA * 0.928);
            G = r * (0.213 - cosA * 0.213 + sinA * 0.143) + g * (0.715 + cosA * 0.285 + sinA * 0.14) + b * (0.072 - cosA * 0.072 - sinA * 0.283);
            B = r * (0.213 - cosA * 0.213 - sinA * 0.787) + g * (0.715 - cosA * 0.715 + sinA * 0.715) + b * (0.072 + cosA * 0.928 + sinA * 0.072);
          }

          const nR = R + k_rg * (R - G) + k_rb * (R - B);
          const nG = G + k_gr * (G - R) + k_gb * (G - B);
          const nB = B + k_br * (B - R) + k_bg * (B - G);

          R = nR; G = nG; B = nB;

          if (applyLevel) {
            const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
            R = Y + (R - Y) * sat;
            G = Y + (G - Y) * sat;
            B = Y + (B - Y) * sat;
          }
        }

        // clamp & output (c255 inline)
        const r255 = R * 255;
        const g255 = G * 255;
        const b255 = B * 255;
        dd[i] = r255 < 0 ? 0 : r255 > 255 ? 255 : r255;
        dd[i + 1] = g255 < 0 ? 0 : g255 > 255 ? 255 : g255;
        dd[i + 2] = b255 < 0 ? 0 : b255 > 255 ? 255 : b255;
        dd[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);

      // 示波器繪製 (這部分也同步在此影格內繪製，避免不同步)
      const g = sc.getContext("2d"), W = sc.width, H = sc.height;
      g.fillStyle = "#0c1110"; g.fillRect(0, 0, W, H);
      if (scope === "vector") {
        const cx = W / 2, cy = H / 2, Rr = Math.min(W, H) / 2 - 12, cs = Rr / 0.5;
        g.strokeStyle = "rgba(70,224,138,0.2)"; g.lineWidth = 1;
        g.beginPath(); g.arc(cx, cy, Rr, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(cx - Rr, cy); g.lineTo(cx + Rr, cy); g.moveTo(cx, cy - Rr); g.lineTo(cx, cy + Rr); g.stroke();
        g.strokeStyle = "rgba(255,174,110,0.5)"; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-123 * Math.PI / 180) * Rr, cy - Math.sin(-123 * Math.PI / 180) * Rr); g.stroke(); g.setLineDash([]);
        [["R", 191, 0, 0], ["YL", 191, 191, 0], ["G", 0, 191, 0], ["CY", 0, 191, 191], ["B", 0, 0, 191], ["MG", 191, 0, 191]].forEach(([l, r0, b0, c0]) => {
          const Y = (0.2126 * r0 + 0.7152 * b0 + 0.0722 * c0) / 255, x = cx + ((c0 / 255 - Y) / 1.8556) * cs, y = cy - ((r0 / 255 - Y) / 1.5748) * cs;
          g.strokeStyle = "rgba(210,225,220,0.45)"; g.strokeRect(x - 4, y - 4, 8, 8); g.fillStyle = "rgba(150,170,165,0.8)"; g.font = "8px monospace"; g.fillText(l, x + 5, y - 5);
        });
        g.fillStyle = "rgba(70,224,138,0.7)";
        for (let i = 0; i < dd.length; i += 20) {
          const r = dd[i] / 255, gg = dd[i + 1] / 255, b = dd[i + 2] / 255, Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
          g.fillRect(cx + ((b - Y) / 1.8556) * cs, cy - ((r - Y) / 1.5748) * cs, 1.4, 1.4);
        }
      } else if (scope === "wave") {
        g.strokeStyle = "rgba(120,140,150,0.18)"; g.lineWidth = 1; g.font = "8px monospace";
        [0, 0.25, 0.5, 0.75, 1].forEach((p) => { const y = H - 6 - p * (H - 12); g.beginPath(); g.moveTo(22, y); g.lineTo(W - 4, y); g.stroke(); g.fillStyle = "rgba(120,140,150,0.6)"; g.fillText(Math.round(p * 100), 2, y + 3); });
        g.fillStyle = "rgba(70,224,138,0.5)";
        for (let i = 0; i < dd.length; i += 12) {
          const px = (i / 4) % SW, Y = (0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2]) / 255;
          g.fillRect(22 + (px / SW) * (W - 26), H - 6 - Y * (H - 12), 1.3, 1.3);
        }
      } else {
        const bins = 96, R_arr = new Float32Array(bins), G_arr = new Float32Array(bins), B_arr = new Float32Array(bins);
        for (let i = 0; i < dd.length; i += 8) {
          R_arr[Math.min(bins - 1, (dd[i] / 256 * bins) | 0)]++;
          G_arr[Math.min(bins - 1, (dd[i + 1] / 256 * bins) | 0)]++;
          B_arr[Math.min(bins - 1, (dd[i + 2] / 256 * bins) | 0)]++;
        }
        let mx = 1;
        for (let i = 0; i < bins; i++) {
          if (R_arr[i] > mx) mx = R_arr[i];
          if (G_arr[i] > mx) mx = G_arr[i];
          if (B_arr[i] > mx) mx = B_arr[i];
        }
        const dh = (arr, col) => {
          g.fillStyle = col; g.beginPath(); g.moveTo(4, H - 4);
          for (let i = 0; i < bins; i++) g.lineTo(4 + (i / (bins - 1)) * (W - 8), H - 4 - (arr[i] / mx) * (H - 12));
          g.lineTo(W - 4, H - 4); g.closePath(); g.fill();
        };
        dh(R_arr, "rgba(255,90,80,0.45)"); dh(G_arr, "rgba(70,224,138,0.45)"); dh(B_arr, "rgba(90,168,255,0.45)");
      }
    };

    // 使用 requestAnimationFrame 來節流繪製，防止 Slider 拉動時阻塞
    rAFId = requestAnimationFrame(render);

    return () => {
      active = false;
      cancelAnimationFrame(rAFId);
    };
  }, [st, source, bypass, scope]);

  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const im = new Image(); im.onload = () => { imgRef.current = im; setSource("upload"); }; im.src = URL.createObjectURL(f); };

  const isSony = mode === "sony";
  const accent = isSony ? "#1d77c4" : "#ff6a3d";
  const tabSt = (active) => ({ padding: "5px 12px", fontSize: 12, fontFamily: fSans, cursor: "pointer", borderRadius: 6, border: `1px solid ${active ? accent : "#2e333a"}`, background: active ? (isSony ? "rgba(29,119,196,0.14)" : "rgba(255,106,61,0.12)") : "transparent", color: active ? accent : "#8b9298" });

  return (
    <div style={{ background: "#16191e", borderRadius: 12, padding: 18, color: "#eceef0", fontFamily: fSans, border: "1px solid #252a33", borderTop: `3px solid ${accent}`, boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .cm-sn{ -webkit-appearance:none;appearance:none;width:136px;height:24px;background:transparent;outline:none;cursor:pointer;margin:0;display:inline-block;vertical-align:middle;}
        .cm-sn::-webkit-slider-runnable-track{width:100%;height:3px;background:#2a4258;border-radius:2px;}
        .cm-sn::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:2px;background:var(--a);cursor:pointer;margin-top:-6.5px;box-shadow:0 1px 3px rgba(0,0,0,0.5);}
        .cm-sn::-moz-range-track{width:100%;height:3px;background:#2a4258;border-radius:2px;}
        .cm-sn::-moz-range-thumb{width:16px;height:16px;border-radius:2px;background:var(--a);border:none;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.5);}
        .cm-av{ -webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:3px;background:linear-gradient(90deg,var(--a) var(--p),#363c42 var(--p));outline:none;cursor:pointer;}
        .cm-av::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.5);}
        .cm-av::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:none;cursor:pointer;}
      `}</style>

      {/* header + toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 14, color: "#cdd4d8" }}>色彩矩陣 · UI 範式對照</div>
        <div style={{ display: "flex", background: "#0e1013", border: "1px solid #2b3036", borderRadius: 9, padding: 3, gap: 3 }}>
          {[["sony", "Sony BRC-AM7"], ["aver", "AVer"]].map(([m, lb]) => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 500, fontFamily: fSans, cursor: "pointer", borderRadius: 7, border: "none", background: mode === m ? (m === "sony" ? "#1d77c4" : "#ff6a3d") : "transparent", color: mode === m ? "#fff" : "#8b9298" }}>{lb}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#6f767c", marginBottom: 14 }}>
        {isSony ? "工程式列表選單 · 沿用 LEVEL / PHASE / R-G 術語 · 示波器內建但需從選單切換、與調整分屬不同層" : "web-first · 漸進揭露 · 白話命名 · 監看與控制並排、隨調隨看"}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {/* shared preview + monitor */}
        <div style={{ flex: "1 1 396px", minWidth: 330 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSource("scene")} style={tabSt(source === "scene")}>模擬畫面</button>
              <button onClick={() => setSource("bars")} style={{ ...tabSt(source === "bars"), display: "flex", alignItems: "center", gap: 5 }}>彩條<span style={{ fontSize: 9, color: "#5b626a", border: "1px solid #3a4047", borderRadius: 3, padding: "0 4px" }}>測試</span></button>
              <button onClick={() => fileRef.current?.click()} style={tabSt(source === "upload")}>上傳</button>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
            </div>
            <button onMouseDown={() => setBypass(true)} onMouseUp={() => setBypass(false)} onMouseLeave={() => setBypass(false)} onTouchStart={() => setBypass(true)} onTouchEnd={() => setBypass(false)}
              style={{ padding: "5px 12px", fontSize: 12, fontFamily: fSans, cursor: "pointer", borderRadius: 6, border: "1px solid #3a4047", background: bypass ? "#23272c" : "transparent", color: bypass ? accent : "#8b9298" }}>按住看原始</button>
          </div>
          <div style={{ border: "1px solid #2e333a", borderRadius: 8, overflow: "hidden", background: "#000", position: "relative" }}>
            <canvas ref={preRef} width={SW} height={SH} style={{ width: "100%", display: "block", imageRendering: source === "bars" ? "pixelated" : "auto" }} />
            <span style={{ position: "absolute", left: 9, top: 7, fontFamily: fMono, fontSize: 10, color: "rgba(255,255,255,.75)", textShadow: "0 1px 2px #000" }}>{bypass ? "● 原始" : "● 校正後 LIVE"}</span>
          </div>
          <div style={{ marginTop: 12, background: "#1f232a", border: "1px solid #2f3642", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#8b9298" }}>監看</span>
              <div style={{ display: "flex", background: "#0e1013", border: "1px solid #2e333a", borderRadius: 7, padding: 2, gap: 2 }}>
                {SCOPES.map(([id, lb]) => (
                  <button key={id} onClick={() => setScope(id)} style={{ padding: "4px 11px", fontSize: 11.5, fontFamily: fSans, cursor: "pointer", borderRadius: 5, border: "none", background: scope === id ? accent : "transparent", color: scope === id ? "#fff" : "#8b9298" }}>{lb}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ border: "1px solid #2e333a", borderRadius: 8, padding: 4, background: "#0c1110" }}>
                <canvas ref={scRef} width={scope === "vector" ? 150 : 200} height={150} style={{ width: scope === "vector" ? 150 : 200, display: "block" }} />
              </div>
              <div style={{ fontSize: 11.5, color: "#8b9298", lineHeight: 1.6, flex: 1 }}>
                {SCOPE_HINT[scope]}
                {isSony && <div style={{ color: "#6f767c", marginTop: 6 }}>BRC-AM7 同樣有這三種,但一次顯示一種、從選單切換。</div>}
              </div>
            </div>
          </div>
        </div>

        {/* swappable controls */}
        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          {isSony
            ? <SonyPanel st={st} upd={upd} sel={sel} setSel={setSel} />
            : <AverPanel st={st} upd={upd} look={look} pickLook={pickLook} adv={adv} setAdv={setAdv} resetAdv={resetAdv} />}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={reset} style={{ flex: 1, padding: "10px", fontSize: 13, fontFamily: fSans, cursor: "pointer", borderRadius: 8, border: "1px solid #3a4047", background: "transparent", color: "#8b9298" }}>重設</button>
            <button style={{ flex: 2, padding: "10px", fontSize: 13, fontWeight: 500, fontFamily: fSans, cursor: "pointer", borderRadius: 8, border: "none", background: accent, color: "#fff" }}>{isSony ? "STORE" : "套用至攝影機"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
