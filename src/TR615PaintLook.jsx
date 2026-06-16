import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================================
// 1. 色彩與信號處理引擎 (Color & Signal Processing Engine)
// 這些函數模擬了攝影機內部 DSP 晶片的訊號處理流程。
// ============================================================================

/**
 * 數值限幅函數 (Clamp)，將數值限制在 0-255 之間
 */
const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * RGB 轉 HSV 色彩空間
 */
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

/**
 * HSV 轉 RGB 色彩空間
 */
function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

/**
 * 旋轉 RGB 顏色向量的色相 (Hue Rotate)
 */
function hueRotate(r, g, b, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928),
    r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.14) + b * (0.072 - c * 0.072 - s * 0.283),
    r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072),
  ];
}

// 根據 Sony 廣播級攝影機標準定義的 16 軸色彩順序
const AXIS16 = ["B", "B+", "MG-", "MG", "MG+", "R", "R+", "YL-", "YL", "YL+", "G-", "G", "G+", "CY", "CY+", "B-"];

// 16 軸對應的基礎色相角度 (0-360)
const AXIS_HUE = { 
  "B": 230, "B+": 250, "MG-": 270, "MG": 300, "MG+": 320, 
  "R": 0, "R+": 15, "YL-": 35, "YL": 55, "YL+": 75, 
  "G-": 95, "G": 120, "G+": 145, "CY": 180, "CY+": 205, "B-": 218 
};

/**
 * 應用 User Matrix 色彩矩陣調整
 * 模擬矩陣係數相互擠壓、色彩飽和度(level)與整體色相(phase)的線性變換
 */
function applyMatrix(R, G, B, m) {
  // 1. 套用 Phase (整體色相旋轉，範圍為 +/- 30 度)
  if (m.phase !== 0) [R, G, B] = hueRotate(R, G, B, (m.phase / 99) * 30);
  
  // 2. 套用六色混合矩陣 (R-G, R-B, G-R, G-B, B-R, B-G 色差擠壓)
  const k = 0.75; // 混合強度增益係數
  const nR = R + k * ((m.rg / 100) * (R - G) + (m.rb / 100) * (R - B));
  const nG = G + k * ((m.gr / 100) * (G - R) + (m.gb / 100) * (G - B));
  const nB = B + k * ((m.br / 100) * (B - R) + (m.bg / 100) * (B - G));
  R = nR; G = nG; B = nB;
  
  // 3. 套用 Level (整體飽和度調整)
  if (m.level !== 0) {
    const sat = 1 + m.level / 120;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B; // Rec. 709 亮度公式
    R = Y + (R - Y) * sat;
    G = Y + (G - Y) * sat;
    B = Y + (B - Y) * sat;
  }
  return [R, G, B];
}

/**
 * 應用 16 軸 Multi-Matrix 局部色彩調整
 * 僅對最接近的兩個色相區間做平滑插值(Interpolation)調整，不影響其他色區
 */
function applyMulti(R, G, B, axes) {
  let [h, s, v] = rgb2hsv(R, G, B);
  if (s < 0.05) return [R, G, B]; // 忽略極低飽和度區（接近灰色/黑白的像素）

  // 尋找色相距離最近的 16 軸節點
  let best = 0, bd = 999;
  AXIS16.forEach((a, i) => {
    let d = Math.abs(((AXIS_HUE[a] - h + 540) % 360) - 180);
    if (d < bd) { bd = d; best = i; }
  });

  const ax = axes[AXIS16[best]];
  if (!ax || (ax.hue === 0 && ax.sat === 0)) return [R, G, B];

  // 使用溫和的餘弦/線性權重，使相鄰色域過渡自然 (半寬度約 30 度)
  const w = Math.max(0, 1 - bd / 30);
  h += (ax.hue / 99) * 22 * w;         // 最大調整偏轉約 22 度
  s *= 1 + (ax.sat / 99) * 0.85 * w;   // 最大飽和度變更倍率
  
  return hsv2rgb(h, Math.min(1, s), v);
}

/**
 * 應用色調與伽馬曲線控制 (Tone / Knee / Black Level)
 * - Black Level (黑位準): 對暗部進行提升或壓低
 * - Knee Point & Slope (高光壓縮): 針對高光部分做壓縮以保留過曝層次
 */
function applyTone(R, G, B, p) {
  // Black level 提升暗部基準 (影響全圖，但偏向暗部)
  const bl = p.black / 50 * 0.12;
  const kneeOn = p.kneeOn && !p.autoKnee;
  const kp = p.kneePoint / 109, slope = 0.5 + (p.kneeSlope + 5) / 20;

  const f = (v) => {
    // 套用黑位補償
    v = v + bl * (1 - v);
    // 套用高光壓縮曲線
    if (kneeOn && v > kp) {
      v = kp + (v - kp) * slope;
    }
    return v;
  };

  return [f(R), f(G), f(B)];
}

/**
 * 應用輪廓細節增強 (Detail Level)
 * 模擬硬體內部的 3x3 拉普拉斯(Laplacian)邊緣檢測高頻濾波器
 */
function applyDetail(data, W, H, level) {
  if (level === 0) return data;
  const out = new Uint8ClampedArray(data);
  const amt = level / 7 * 0.6; // 調整強度係數

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        // 拉普拉斯運算元 (邊緣高頻分量)
        const lap = 4 * data[i + c] - data[i - 4 + c] - data[i + 4 + c] - data[i - W * 4 + c] - data[i + W * 4 + c];
        out[i + c] = c255(data[i + c] + lap * amt);
      }
    }
  }
  return out;
}

// 實景預覽物理尺寸 (16:9 HD 格式)
const SW = 1280, SH = 720;

/**
 * 備用繪製函數 (Fallback Draw)
 * 當外部圖片 /meeting_room.png 載入失敗時，以程式畫布渲染一個高品質的虛擬訪談直播間。
 * 這解決了檔案轉交給 Claude 後，由於沒有圖片資源而無法顯示畫面的問題。
 */
function drawFallbackScene(ctx) {
  // 1. 溫暖與日光色溫的簡約冷灰底牆漸層 (符合冷色系與乾淨訪談風格)
  let g = ctx.createLinearGradient(0, 0, SW, SH);
  g.addColorStop(0, "rgb(155, 162, 170)"); // 日光偏亮灰色
  g.addColorStop(1, "rgb(98, 105, 114)");  // 沉靜暗灰色
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, SH);

  // 2. 模擬來自左側的柔和日照光線 (為 Knee Point 高光壓縮提供動態亮部)
  const rg = ctx.createRadialGradient(SW * 0.2, SH * 0.2, 20, SW * 0.2, SH * 0.2, SW * 0.45);
  rg.addColorStop(0, "rgba(255, 252, 245, 0.9)");
  rg.addColorStop(1, "rgba(255, 252, 245, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, SW, SH);

  // 3. 繪製簡約的現代訪談長桌 (深色木紋質感)
  ctx.fillStyle = "rgb(42, 45, 48)";
  ctx.beginPath();
  ctx.moveTo(SW * 0.15, SH * 0.8);
  ctx.lineTo(SW * 0.85, SH * 0.8);
  ctx.lineTo(SW * 0.9, SH);
  ctx.lineTo(SW * 0.1, SH);
  ctx.closePath();
  ctx.fill();

  // 4. 繪製左、右兩側極簡現代設計師椅子的剪影
  // 左椅
  ctx.fillStyle = "rgb(30, 32, 35)";
  ctx.beginPath();
  ctx.moveTo(SW * 0.25, SH * 0.8);
  ctx.lineTo(SW * 0.35, SH * 0.8);
  ctx.lineTo(SW * 0.38, SH * 0.55);
  ctx.lineTo(SW * 0.22, SH * 0.55);
  ctx.closePath();
  ctx.fill();
  // 右椅
  ctx.fillStyle = "rgb(30, 32, 35)";
  ctx.beginPath();
  ctx.moveTo(SW * 0.65, SH * 0.8);
  ctx.lineTo(SW * 0.75, SH * 0.8);
  ctx.lineTo(SW * 0.78, SH * 0.55);
  ctx.lineTo(SW * 0.62, SH * 0.55);
  ctx.closePath();
  ctx.fill();

  // 5. 繪製桌上的專業直播懸臂麥克風
  ctx.strokeStyle = "rgb(20, 20, 20)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(SW * 0.5, SH * 0.8);    // 麥克風底座
  ctx.lineTo(SW * 0.48, SH * 0.7);   // 支架第一段
  ctx.lineTo(SW * 0.52, SH * 0.62);  // 支架第二段
  ctx.stroke();
  
  // 麥克風防震架與防風罩
  ctx.fillStyle = "rgb(50, 50, 50)";
  ctx.beginPath();
  ctx.arc(SW * 0.52, SH * 0.6, 10, 0, Math.PI * 2);
  ctx.fill();

  // 6. 底部標準色度參考色塊 (Color Chips) 用於肉眼調色對照
  const colors = ["rgb(200, 50, 50)", "rgb(230, 160, 40)", "rgb(60, 150, 80)", "rgb(50, 110, 200)"];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(SW - 130 + i * 28, SH - 36, 22, 22);
  });
}

// ============================================================================
// 2. UI 主題配色與樣式常數 (AVer UI Theme Colors)
// ============================================================================
const T = {
  page: "#0d0e10",       // 背景頁面深灰黑色
  side: "#16181b",       // 側邊欄背景深灰色
  sideActive: "#1e6fd9", // 側邊欄選中藍色
  sideHover: "#202328",  // 側邊欄懸停背景
  panel: "#1a1d21",      // 卡片面板主色
  panel2: "#212529",     // 二級面板/按鈕色
  line: "#2c3138",       // 分割線暗灰色
  line2: "#3a4048",      // 較亮分割線
  text: "#e8eaec",       // 主文字白色
  dim: "#8e959c",        // 次要文字灰色
  faint: "#5e656d",      // 提示文字深灰色
  blue: "#1e9bf0",       // 科技藍色
  blueDark: "#1670b8",   // 偏暗藍色
  green: "#37d67a",      // 狀態綠色
  amber: "#f5a623",      // 警示黃色
};

const fUI = "'Segoe UI','Noto Sans TC',system-ui,sans-serif";
const fMono = "'Consolas','Courier New',monospace";

// 主要功能選單區塊定義
const BLOCKS = [
  ["matrix", "Matrix", "User Matrix 色彩矩陣"],
  ["multi", "Multi-Matrix", "16 軸分區色彩"],
  ["detail", "Detail", "輪廓銳利度"],
  ["knee", "Knee", "高光壓縮"],
  ["black", "Black Level", "黑位準"],
];

// Matrix 六色軸係數鍵值與中文提示
const MATRIX_KEYS = [
  ["level", "Level", "整體飽和度"],
  ["phase", "Phase", "整體色相"],
  ["rg", "R-G", ""],
  ["rb", "R-B", ""],
  ["gr", "G-R", ""],
  ["gb", "G-B", ""],
  ["br", "B-R", ""],
  ["bg", "B-G", ""]
];

const DEF_AXES = () => {
  const o = {};
  AXIS16.forEach((a) => (o[a] = { hue: 0, sat: 0 }));
  return o;
};

// 預設的標準原廠設定值 (Standard / Neutral Preset)
const DEF = {
  matrixOn: true, level: 0, phase: 0, rg: 0, rb: 0, gr: 0, gb: 0, br: 0, bg: 0,
  multiOn: false, axes: DEF_AXES(),
  detailOn: false, detail: 0,
  kneeOn: false, autoKnee: false, kneeSens: "Mid", kneePoint: 95, kneeSlope: 0,
  black: 0,
};

// ============================================================================
// 3. React 共用子組件 (Atoms Components)
// ============================================================================

/**
 * 數值滑動輸入組件 (Slider)
 */
function Slider({ k, label, hint, min, max, val, onChange, neutral = 0 }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 14, color: T.text }}>
          {label}
          {hint ? <span style={{ color: T.faint, fontSize: 14 }}> · {hint}</span> : null}
        </span>
        <span style={{ fontFamily: fMono, fontSize: 14, color: val === neutral ? T.faint : T.blue }}>
          {val > 0 && min < 0 ? "+" + val : val}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: fMono, fontSize: 14, color: T.faint, width: 24, textAlign: "right" }}>{min}</span>
        <input 
          type="range" 
          min={min} 
          max={max} 
          value={val} 
          onChange={(e) => onChange(parseInt(e.target.value))} 
          className="tr-sl" 
          style={{ "--p": ((val - min) / (max - min)) * 100 + "%" }} 
        />
        <span style={{ fontFamily: fMono, fontSize: 14, color: T.faint, width: 24 }}>{max}</span>
      </div>
    </div>
  );
}

/**
 * 開關按鈕組件 (Switch / Toggle)
 */
function Toggle({ on, onChange, label }) {
  return (
    <button 
      onClick={() => onChange(!on)} 
      style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <span style={{ width: 34, height: 18, borderRadius: 9, background: on ? T.blue : T.line2, position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "left .15s" }} />
      </span>
      {label && <span style={{ fontSize: 14, color: on ? T.text : T.dim }}>{label}</span>}
    </button>
  );
}

/**
 * 區塊標題組件 (Block Header)
 */
function BlockHeader({ title, sub, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{title}</div>
        <div style={{ fontSize: 14, color: T.faint, marginTop: 2 }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}

/**
 * 迷你按鈕組件 (Mini Button)
 */
function MiniBtn({ children, onClick, primary, disabled }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      style={{ 
        flex: 1, padding: "4px 0", fontSize: 14, cursor: disabled ? "default" : "pointer", 
        borderRadius: 5, border: `1px solid ${primary ? T.blueDark : T.line2}`, 
        background: primary ? "rgba(30,155,240,0.12)" : "transparent", 
        color: disabled ? T.faint : primary ? T.blue : T.dim, 
        opacity: disabled ? 0.45 : 1, fontFamily: fUI 
      }}
    >
      {children}
    </button>
  );
}

/**
 * 說明提示組件 (Note)
 */
function Note({ children }) {
  return (
    <div style={{ fontSize: 14, color: T.faint, lineHeight: 1.6, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
      {children}
    </div>
  );
}

/**
 * 警示提示組件 (Cross Hint)
 */
function CrossHint({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 7, background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.25)", fontSize: 14, color: "#d9b06a", lineHeight: 1.5 }}>
      <span style={{ fontSize: 14 }}>⚠</span>{children}
    </div>
  );
}

/**
 * 生成各參數狀態的單行摘要文字，供快照記錄與比較
 */
function summarize(d) {
  return (
    <>
      <div>Matrix {d.matrixOn ? "ON" : "OFF"} · LVL{d.level >= 0 ? "+" : ""}{d.level} PH{d.phase >= 0 ? "+" : ""}{d.phase}</div>
      <div>RG{d.rg >= 0 ? "+" : ""}{d.rg} RB{d.rb >= 0 ? "+" : ""}{d.rb} GR{d.gr >= 0 ? "+" : ""}{d.gr} GB{d.gb >= 0 ? "+" : ""}{d.gb} BR{d.br >= 0 ? "+" : ""}{d.br} BG{d.bg >= 0 ? "+" : ""}{d.bg}</div>
      <div>Multi {d.multiOn ? "ON" : "OFF"} · Detail {d.detailOn ? (d.detail >= 0 ? "+" : "") + d.detail : "OFF"} · Knee {d.kneeOn ? (d.autoKnee ? "AUTO" : `P${d.kneePoint}/S${d.kneeSlope >= 0 ? "+" : ""}${d.kneeSlope}`) : "OFF"} · BLK{d.black >= 0 ? "+" : ""}{d.black}</div>
    </>
  );
}

/**
 * 右側場景檔的小方塊縮圖按鈕 (Scene Select Grid Tile)
 */
function SceneTile({ thumb, name, remark, active, dirty, factory, onLoad }) {
  return (
    <button 
      onClick={onLoad} 
      title={remark || name} 
      style={{ 
        width: "100%", padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", 
        textAlign: "left", background: T.panel2, 
        border: `1.5px solid ${active ? T.blue : T.line}`, 
        boxShadow: active ? "0 0 0 2px rgba(30,155,240,0.15)" : "none", transition: "all .15s" 
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16/9", background: "#0a0c0e" }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.faint, fontSize: 14 }}>無縮圖</div>
        )}
        {factory && (
          <span style={{ position: "absolute", left: 3, top: 3, fontSize: 14, fontWeight: 700, background: "rgba(30,155,240,0.92)", color: "#fff", borderRadius: 2, padding: "0 3px" }}>
            原廠
          </span>
        )}
        {active && (
          <span style={{ position: "absolute", right: 3, top: 3, width: 6, height: 6, borderRadius: 3, background: dirty ? T.amber : T.green, boxShadow: "0 0 3px rgba(0,0,0,0.6)" }} />
        )}
      </div>
      <div style={{ padding: "3px 4px 4px", fontSize: 14, fontWeight: 600, color: active ? T.blue : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
        {name}
      </div>
    </button>
  );
}

/**
 * 場景庫管理中的詳細卡片組件 (Scene Card Detail)
 */
function SceneCard({ thumb, name, remark, time, active, dirty, factory, onLoad, actions, summary, expanded, onToggleExpand }) {
  return (
    <div style={{ border: `1px solid ${active ? T.blue : T.line}`, borderRadius: 9, background: T.panel2, overflow: "hidden", outline: active ? "2px solid rgba(30,155,240,0.2)" : "none" }}>
      <button 
        onClick={onLoad} 
        style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ position: "relative", aspectRatio: "16/9", background: "#0a0c0e" }}>
          {thumb ? (
            <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.faint, fontSize: 14 }}>無縮圖</div>
          )}
          {factory && (
            <span style={{ position: "absolute", left: 6, top: 6, fontSize: 14, fontWeight: 600, background: "rgba(30,155,240,0.9)", color: "#fff", borderRadius: 4, padding: "1px 6px" }}>
              原廠
            </span>
          )}
          {active && (
            <span style={{ position: "absolute", right: 6, top: 6, fontSize: 14, fontWeight: 600, background: dirty ? "rgba(245,166,35,0.92)" : "rgba(55,214,122,0.92)", color: "#0a0c0e", borderRadius: 4, padding: "1px 6px" }}>
              {dirty ? "使用中 · 已修改" : "使用中"}
            </span>
          )}
        </div>
        <div style={{ padding: "7px 9px 4px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: active ? T.blue : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div style={{ fontSize: 14, color: T.dim, minHeight: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {remark || (factory ? "原廠基準值,不可修改" : "")}
          </div>
          {time && <div style={{ fontSize: 14, color: T.faint, fontFamily: fMono, marginTop: 2 }}>{time}</div>}
        </div>
      </button>
      <div style={{ display: "flex", gap: 4, padding: "4px 9px 8px", alignItems: "center" }}>
        {actions}
        <button 
          onClick={onToggleExpand} 
          title="查看數值" 
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.faint, fontSize: 14, padding: 2, transform: expanded ? "rotate(180deg)" : "none" }}
        >
          ▾
        </button>
      </div>
      {expanded && summary && (
        <div style={{ padding: "6px 9px 9px", borderTop: `1px solid ${T.line}`, fontFamily: fMono, fontSize: 14, color: T.dim, lineHeight: 1.7 }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. React App 主要元件 (Main Application Component)
// ============================================================================
export default function App() {
  const [st, setSt] = useState(JSON.parse(JSON.stringify(DEF)));
  const [block, setBlock] = useState("matrix");
  const [selAxis, setSelAxis] = useState("R");
  const [scenes, setScenes] = useState([]);            // 使用者場景檔陣列: {id, name, remark, savedAt, thumb, data}
  const [activeScene, setActiveScene] = useState("std"); // 目前載入的場景 ID ("std" 代表原廠 Standard)
  const [sceneDirty, setSceneDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [scName, setScName] = useState("");
  const [scRemark, setScRemark] = useState("");
  const [expandedScene, setExpandedScene] = useState(null);
  const [stdThumb, setStdThumb] = useState(null);
  const [scope, setScope] = useState("vector");
  const [showScope, setShowScope] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [toast, setToast] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);

  // 引用 DOM 節點
  const preRef = useRef(null);   // 影像預覽 Canvas
  const scRef = useRef(null);    // 示波器 Canvas
  const baseRef = useRef(null);  // 用於暫存最原始未經過調整的 ImageData

  // 狀態更新工具
  const upd = useCallback((k, v) => { 
    setSt((s) => ({ ...s, [k]: v })); 
    setSceneDirty(true); 
  }, []);
  
  const updAxis = (axis, key, v) => { 
    setSt((s) => ({ ...s, axes: { ...s.axes, [axis]: { ...s.axes[axis], [key]: v } } })); 
    setSceneDirty(true); 
  };
  
  const flash = (m) => { 
    setToast(m); 
    setTimeout(() => setToast(""), 1800); 
  };

  // ==========================================================================
  // A. 圖片載入與備用方案處理 (Image Loader & Fallback Logic)
  // ==========================================================================
  useEffect(() => {
    const img = new Image();
    
    // 設定 onerror 處理：如果外部圖片不存在，繪製備用畫面，確保系統可移植性與獨立性
    img.onerror = () => {
      console.warn("外部背景圖未尋獲，改用預設的高畫質訪談直播間 Canvas 模擬畫面。");
      const cv = document.createElement("canvas");
      cv.width = SW;
      cv.height = SH;
      const ctx = cv.getContext("2d");
      
      // 繪製模擬畫面
      drawFallbackScene(ctx);
      
      baseRef.current = ctx.getImageData(0, 0, SW, SH);
      setStdThumb(cv.toDataURL("image/jpeg", 0.55));
      setImgLoaded(true);
    };

    img.onload = () => {
      const cv = document.createElement("canvas"); 
      cv.width = SW; 
      cv.height = SH;
      const ctx = cv.getContext("2d");
      
      // 強行剪裁與比例計算 (模擬 object-fit: cover)
      const imgRatio = img.width / img.height;
      const cvRatio = SW / SH;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgRatio > cvRatio) {
        sw = img.height * cvRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / cvRatio;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SW, SH);
      
      baseRef.current = ctx.getImageData(0, 0, SW, SH);
      setStdThumb(cv.toDataURL("image/jpeg", 0.55));
      setImgLoaded(true);
    };

    // 使用隨機或時間戳避免瀏覽器快取
    img.src = "/meeting_room.png?t=" + Date.now();
  }, []);

  // ==========================================================================
  // B. 即時影像運算與示波器繪製副作用 (Real-time DSP Processing Loop)
  // 依靠 baseRef.current 控制 Canvas 的物理重繪
  // ==========================================================================
  useEffect(() => {
    const base = baseRef.current, cvs = preRef.current; 
    if (!base || !cvs) return;
    
    const ctx = cvs.getContext("2d");
    const sd = base.data;
    let work = new Uint8ClampedArray(sd.length);
    
    // 1. 套用色彩引擎演算法 (逐像素處理)
    for (let i = 0; i < sd.length; i += 4) {
      let R = sd[i] / 255, G = sd[i + 1] / 255, B = sd[i + 2] / 255;
      if (!bypass) {
        // A. 色調/黑位與高光壓縮 (Tone & Knee)
        [R, G, B] = applyTone(R, G, B, { 
          black: st.black, kneeOn: st.kneeOn, 
          autoKnee: st.autoKnee, kneePoint: st.kneePoint, kneeSlope: st.kneeSlope 
        });
        // B. 色彩矩陣 (User Matrix)
        if (st.matrixOn) [R, G, B] = applyMatrix(R, G, B, st);
        // C. 16 軸色彩分區 (Multi-Matrix)
        if (st.multiOn) [R, G, B] = applyMulti(R, G, B, st.axes);
      }
      work[i] = c255(R * 255); 
      work[i + 1] = c255(G * 255); 
      work[i + 2] = c255(B * 255); 
      work[i + 3] = 255;
    }
    
    // D. 細節邊緣銳化 (Detail)
    if (!bypass && st.detailOn && st.detail !== 0) {
      work = applyDetail(work, SW, SH, st.detail);
    }
    
    // 將運算後的影像資料投射回畫布
    const out = new ImageData(work, SW, SH);
    ctx.putImageData(out, 0, 0);

    // 2. 繪製示波器 (Vector Scope / Waveform Monitor)
    if (showScope && scRef.current) {
      const g = scRef.current.getContext("2d"), W = scRef.current.width, H = scRef.current.height;
      g.fillStyle = "rgba(8, 12, 10, 0.92)"; 
      g.fillRect(0, 0, W, H);
      
      const dd = work;
      
      if (scope === "vector") {
        // ==================== 向量示波器 (Vector Scope) ====================
        const cx = W / 2, cy = H / 2, Rr = Math.min(W, H) / 2 - 10, cs = Rr / 0.5;
        
        // 繪製中心十字與外圓圈
        g.strokeStyle = "rgba(70, 224, 138, 0.25)"; 
        g.lineWidth = 1;
        g.beginPath(); 
        g.arc(cx, cy, Rr, 0, 7); 
        g.stroke();
        
        g.beginPath(); 
        g.moveTo(cx - Rr, cy); 
        g.lineTo(cx + Rr, cy); 
        g.moveTo(cx, cy - Rr); 
        g.lineTo(cx, cy + Rr); 
        g.stroke();
        
        // 繪製膚色參考線 (Flesh Tone Line - 偏黃紅軸, 角度約為 123 度)
        g.strokeStyle = "rgba(255, 174, 110, 0.5)"; 
        g.setLineDash([3, 3]);
        g.beginPath(); 
        g.moveTo(cx, cy); 
        g.lineTo(cx + Math.cos(-123 * Math.PI / 180) * Rr, cy - Math.sin(-123 * Math.PI / 180) * Rr); 
        g.stroke(); 
        g.setLineDash([]);
        
        // 繪製六個色彩的標靶參考框格 (R, YL, G, CY, B, MG)
        [["R", 191, 0, 0], ["YL", 191, 191, 0], ["G", 0, 191, 0], ["CY", 0, 191, 191], ["B", 0, 0, 191], ["MG", 191, 0, 191]].forEach(([l, r0, g0, b0]) => {
          const Y = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
          const x = cx + ((b0 / 255 - Y) / 1.8556) * cs;
          const y = cy - ((r0 / 255 - Y) / 1.5748) * cs;
          g.strokeStyle = "rgba(220, 230, 225, 0.5)"; 
          g.strokeRect(x - 3.5, y - 3.5, 7, 7); 
          g.fillStyle = "rgba(160, 180, 175, 0.9)"; 
          g.font = "8px monospace"; 
          g.fillText(l, x + 5, y - 4);
        });
        
        // 採樣影像像素投射到向量空間 (降採樣以求效能)
        g.fillStyle = "rgba(70, 224, 138, 0.75)";
        for (let i = 0; i < dd.length; i += 24) { 
          const r = dd[i] / 255, gg = dd[i + 1] / 255, b = dd[i + 2] / 255;
          const Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b; 
          g.fillRect(cx + ((b - Y) / 1.8556) * cs, cy - ((r - Y) / 1.5748) * cs, 1.3, 1.3); 
        }
      } else {
        // ==================== 亮度波形圖 (Waveform Monitor) ====================
        g.lineWidth = 1; 
        g.font = "8px monospace";
        // 標記 0%, 50%, 100% 刻度線
        [0, 0.5, 1].forEach((p) => { 
          const y = H - 5 - p * (H - 10); 
          g.strokeStyle = "rgba(120, 140, 150, 0.25)"; 
          g.beginPath(); 
          g.moveTo(18, y); 
          g.lineTo(W - 3, y); 
          g.stroke(); 
          g.fillStyle = "rgba(150, 165, 175, 0.8)"; 
          g.fillText(Math.round(p * 100), 1, y + 3); 
        });
        // 投射各列的亮度分佈
        g.fillStyle = "rgba(70, 224, 138, 0.55)";
        for (let i = 0; i < dd.length; i += 16) { 
          const px = (i / 4) % SW;
          const Y = (0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2]) / 255; 
          g.fillRect(18 + (px / SW) * (W - 22), H - 5 - Y * (H - 10), 1.2, 1.2); 
        }
      }
    }
  }, [st, bypass, scope, showScope, imgLoaded]);

  // C. 切換控制項目時自動建議對應的示波器
  useEffect(() => {
    if (block === "knee" || block === "black") setScope("wave");
    if (block === "matrix" || block === "multi") setScope("vector");
  }, [block]);

  // ==========================================================================
  // C. 預設場景存取與狀態管理邏輯 (Preset & State Actions)
  // ==========================================================================
  const blockActive = (id) => {
    if (id === "matrix") return st.matrixOn && (st.level || st.phase || st.rg || st.rb || st.gr || st.gb || st.br || st.bg);
    if (id === "multi") return st.multiOn && AXIS16.some((a) => st.axes[a].hue || st.axes[a].sat);
    if (id === "detail") return st.detailOn && st.detail !== 0;
    if (id === "knee") return st.kneeOn;
    if (id === "black") return st.black !== 0;
    return false;
  };

  const snapState = () => JSON.parse(JSON.stringify({ ...st }));
  
  const grabThumb = () => { 
    try { 
      return preRef.current?.toDataURL("image/jpeg", 0.55) || null; 
    } catch { 
      return null; 
    } 
  };
  
  const loadStandard = () => { 
    setSt(JSON.parse(JSON.stringify(DEF))); 
    setActiveScene("std"); 
    setSceneDirty(false); 
    flash("已載入 Standard(原廠預設)"); 
  };
  
  const saveNewScene = () => {
    if (scenes.length >= 16) return;
    const name = scName.trim() || `Scene ${scenes.length + 1}`;
    const id = Date.now();
    setScenes((sc) => [...sc, { 
      id, name, remark: scRemark.trim(), 
      savedAt: new Date().toLocaleString("zh-TW", { hour12: false }), 
      thumb: grabThumb(), data: snapState() 
    }]);
    setActiveScene(id); 
    setSceneDirty(false); 
    setSaveOpen(false); 
    setScName(""); 
    setScRemark("");
    flash(`已儲存「${name}」`);
  };
  
  const loadScene = (s) => { 
    setSt(JSON.parse(JSON.stringify(s.data))); 
    setActiveScene(s.id); 
    setSceneDirty(false); 
    flash(`已載入「${s.name}」`); 
  };
  
  const updateScene = (s) => { 
    setScenes((sc) => sc.map((x) => x.id === s.id ? { 
      ...x, data: snapState(), thumb: grabThumb(), 
      savedAt: new Date().toLocaleString("zh-TW", { hour12: false }) 
    } : x)); 
    setActiveScene(s.id); 
    setSceneDirty(false); 
    flash(`已更新「${s.name}」`); 
  };
  
  const deleteScene = (s) => { 
    setScenes((sc) => sc.filter((x) => x.id !== s.id)); 
    if (activeScene === s.id) setActiveScene(null); 
    flash(`已刪除「${s.name}」`); 
  };

  // ==========================================================================
  // D. 面板渲染路由器 (Parameter Panels Switch)
  // ==========================================================================
  const renderBlock = () => {
    if (block === "matrix") {
      return (
        <div>
          <BlockHeader 
            title="Matrix · User Matrix" 
            sub="色彩矩陣 — 調整各顏色通道之間的關係" 
            right={<Toggle on={st.matrixOn} onChange={(v) => upd("matrixOn", v)} label={st.matrixOn ? "ON" : "OFF"} />} 
          />
          <div style={{ opacity: st.matrixOn ? 1 : 0.35, pointerEvents: st.matrixOn ? "auto" : "none" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 26 }}>
              {MATRIX_KEYS.map(([k, lb, hint]) => (
                <Slider key={k} k={k} label={lb} hint={hint} min={-99} max={99} val={st[k]} onChange={(v) => upd(k, v)} />
              ))}
            </div>
            <Note>Level / Phase 影響整體；六個色差軸彼此交互影響，建議對照向量示波器小幅調整。</Note>
          </div>
        </div>
      );
    }
    
    if (block === "multi") {
      const ax = st.axes[selAxis];
      return (
        <div>
          <BlockHeader 
            title="Multi-Matrix" 
            sub="16 軸分區 — 只調整特定色相範圍，不影響其他顏色" 
            right={<Toggle on={st.multiOn} onChange={(v) => upd("multiOn", v)} label={st.multiOn ? "ON" : "OFF"} />} 
          />
          <div style={{ opacity: st.multiOn ? 1 : 0.35, pointerEvents: st.multiOn ? "auto" : "none", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            
            {/* 16 軸環形虛擬儀表 (3D Conic-Gradient Ring Panel) */}
            <div style={{ position: "relative", width: 290, height: 290, flexShrink: 0 }}>
              <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "conic-gradient(from 0deg, hsl(0 85% 58%), hsl(60 85% 55%), hsl(120 70% 50%), hsl(180 75% 52%), hsl(240 85% 62%), hsl(300 85% 60%), hsl(360 85% 58%))", filter: "blur(18px)", opacity: 0.22 }} />
              <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "conic-gradient(from 0deg, hsl(0 85% 58%), hsl(60 85% 55%), hsl(120 70% 50%), hsl(180 75% 52%), hsl(240 85% 62%), hsl(300 85% 60%), hsl(360 85% 58%))", WebkitMask: "radial-gradient(closest-side, transparent 70%, #000 71%)", mask: "radial-gradient(closest-side, transparent 70%, #000 71%)", opacity: 0.85 }} />
              <div style={{ position: "absolute", inset: 48, borderRadius: "50%", border: `1px dashed ${T.line2}`, animation: "mmspin 30s linear infinite" }} />
              
              {/* 各分區控制按鈕節點 */}
              {AXIS16.map((a) => {
                const ang = (AXIS_HUE[a] - 90) * Math.PI / 180;
                const x = 145 + Math.cos(ang) * 114, y = 145 + Math.sin(ang) * 114;
                const [r, g, b] = hsv2rgb(AXIS_HUE[a], 0.85, 0.95);
                const touched = st.axes[a].hue !== 0 || st.axes[a].sat !== 0;
                const isSel = selAxis === a;
                return (
                  <button 
                    key={a} 
                    onClick={() => setSelAxis(a)} 
                    style={{
                      position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)",
                      width: isSel ? 32 : 24, height: isSel ? 32 : 24, borderRadius: "50%", cursor: "pointer",
                      background: `rgb(${r * 255},${g * 255},${b * 255})`,
                      border: isSel ? "2px solid #fff" : touched ? `2px solid ${T.amber}` : "1px solid rgba(0,0,0,0.55)",
                      boxShadow: isSel ? `0 0 16px hsl(${AXIS_HUE[a]} 90% 60% / 0.85)` : touched ? `0 0 8px ${T.amber}66` : "none",
                      fontSize: 14, fontFamily: fMono, fontWeight: 700, color: "rgba(0,0,0,0.8)",
                      transition: "all .15s", padding: 0,
                    }}
                  >
                    {a}
                  </button>
                );
              })}
              
              {/* 中心數值顯示器 */}
              <div style={{ position: "absolute", inset: 68, borderRadius: "50%", background: "radial-gradient(circle at 38% 30%, #181c21, #0e1114)", border: `1px solid ${T.line2}`, boxShadow: "inset 0 0 24px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                <span style={{ fontSize: 14, letterSpacing: 2, color: T.faint, fontFamily: fMono }}>AXIS</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: T.text, lineHeight: 1.1 }}>{selAxis}</span>
                <span style={{ fontSize: 14, color: T.faint, fontFamily: fMono }}>{AXIS_HUE[selAxis]}°</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4, fontFamily: fMono, fontSize: 14 }}>
                  <span style={{ color: ax.hue ? T.blue : T.faint }}>H {ax.hue > 0 ? "+" + ax.hue : ax.hue}</span>
                  <span style={{ color: ax.sat ? T.amber : T.faint }}>S {ax.sat > 0 ? "+" + ax.sat : ax.sat}</span>
                </div>
              </div>
            </div>

            {/* 控制拉桿與快速指令 */}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, color: T.dim, marginBottom: 12 }}>
                選中軸:<span style={{ color: T.text, fontWeight: 600 }}> {selAxis}</span>
                <span style={{ color: T.faint }}> · 點色環節點切換，亮起 = 已調整</span>
              </div>
              <Slider k="hue" label="Hue" hint="該區色相" min={-99} max={99} val={ax.hue} onChange={(v) => updAxis(selAxis, "hue", v)} />
              <Slider k="sat" label="Saturation" hint="該區飽和度" min={-99} max={99} val={ax.sat} onChange={(v) => updAxis(selAxis, "sat", v)} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <MiniBtn onClick={() => { updAxis(selAxis, "hue", 0); updAxis(selAxis, "sat", 0); }}>此軸歸零</MiniBtn>
                <MiniBtn onClick={() => upd("axes", DEF_AXES())}>全部歸零</MiniBtn>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    if (block === "detail") {
      return (
        <div>
          <BlockHeader 
            title="Detail" 
            sub="輪廓銳利度 (訊號級高頻銳化)" 
            right={<Toggle on={st.detailOn} onChange={(v) => upd("detailOn", v)} label={st.detailOn ? "ON" : "OFF"} />} 
          />
          <div style={{ opacity: st.detailOn ? 1 : 0.35, pointerEvents: st.detailOn ? "auto" : "none", maxWidth: 380 }}>
            <Slider k="detail" label="Level" hint="" min={-7} max={7} val={st.detail} onChange={(v) => upd("detail", v)} />
            <CrossHint>影像處理頁面另有主 Sharpness (0-3) 基本銳利度，兩者將會疊加作用。</CrossHint>
          </div>
        </div>
      );
    }
    
    if (block === "knee") {
      return (
        <div>
          <BlockHeader 
            title="Knee" 
            sub="高光壓縮 — 壓抑過度曝光的白色區域，保留高光細節" 
            right={<Toggle on={st.kneeOn} onChange={(v) => upd("kneeOn", v)} label={st.kneeOn ? "ON" : "OFF"} />} 
          />
          <div style={{ opacity: st.kneeOn ? 1 : 0.35, pointerEvents: st.kneeOn ? "auto" : "none", maxWidth: 420 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Toggle on={st.autoKnee} onChange={(v) => upd("autoKnee", v)} label="Auto Knee" />
              {st.autoKnee && (
                <div style={{ display: "flex", gap: 4 }}>
                  {["Low", "Mid", "High"].map((s) => (
                    <button 
                      key={s} 
                      onClick={() => upd("kneeSens", s)} 
                      style={{ 
                        padding: "3px 10px", fontSize: 14, borderRadius: 5, cursor: "pointer", 
                        border: `1px solid ${st.kneeSens === s ? T.blue : T.line2}`, 
                        background: st.kneeSens === s ? "rgba(30,155,240,0.12)" : "transparent", 
                        color: st.kneeSens === s ? T.blue : T.dim, fontFamily: fUI 
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ opacity: st.autoKnee ? 0.35 : 1, pointerEvents: st.autoKnee ? "none" : "auto" }}>
              <Slider k="kneePoint" label="Point" hint="壓縮起始點" min={75} max={105} val={st.kneePoint} onChange={(v) => upd("kneePoint", v)} neutral={95} />
              <Slider k="kneeSlope" label="Slope" hint="壓縮斜率" min={-5} max={5} val={st.kneeSlope} onChange={(v) => upd("kneeSlope", v)} />
            </div>
            <Note>調整時建議切換至波形圖，觀察亮部 (90-100%) 的訊號壓縮變化。Auto Knee 開啟時將由相機晶片自動調節。</Note>
          </div>
        </div>
      );
    }
    
    if (block === "black") {
      return (
        <div>
          <BlockHeader title="Black Level" sub="黑位準 — 設定圖像的黑電平與暗部對比" />
          <div style={{ maxWidth: 380 }}>
            <Slider k="black" label="Level" hint="" min={-50} max={50} val={st.black} onChange={(v) => upd("black", v)} />
            <Note>負值將加深黑位並提高對比；正值則能提起暗部層次。調整時請注意黑位不應低於 0% 臨界線。</Note>
          </div>
        </div>
      );
    }
  };

  // ==========================================================================
  // E. 佈局架構與 UI 樹 (Page Layout & Main DOM Trees)
  // ==========================================================================
  return (
    <div style={{ background: T.page, width: "100%", height: "100vh", fontFamily: fUI, color: T.text, display: "flex", overflow: "hidden" }}>
      {/* 注入控制滑桿樣式與色環旋轉動畫 */}
      <style>{`
        .tr-sl { -webkit-appearance:none; appearance:none; flex:1; height:4px; border-radius:2px; background:linear-gradient(90deg, ${T.blue} var(--p), #33393f var(--p)); outline:none; cursor:pointer; }
        .tr-sl::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#fff; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.6); }
        .tr-sl::-moz-range-thumb { width:13px; height:13px; border-radius:50%; background:#fff; border:none; cursor:pointer; }
        @keyframes mmspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* 側邊導覽欄 (AVer WebUI Sidebar Template) */}
      <div style={{ width: 220, background: T.side, flexShrink: 0, paddingTop: 20, display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box" }}>
        <div style={{ padding: "4px 24px 20px", fontWeight: 700, fontSize: 22, fontStyle: "italic", letterSpacing: 0.5, color: "#fff" }}>AVer</div>
        {[
          ["Live View", false], 
          ["Camera Settings", false], 
          ["Paint / Look", true], 
          ["Video & Audio", false], 
          ["Network", false], 
          ["Tracking Settings", false], 
          ["NDI", false], 
          ["System", false], 
          ["Audio Integrated", false]
        ].map(([lb, active]) => (
          <div 
            key={lb} 
            style={{ 
              padding: "14px 24px", fontSize: 14, cursor: "pointer", 
              background: active ? T.sideActive : "transparent", 
              color: active ? "#fff" : T.dim, 
              fontWeight: active ? 600 : 400, 
              borderLeft: active ? "4px solid #fff" : "4px solid transparent", 
              transition: "all .15s" 
            }}
          >
            {lb}
          </div>
        ))}
        <div style={{ margin: "auto 16px 20px", padding: "12px 14px", borderRadius: 8, background: "rgba(30,155,240,0.06)", border: `1px solid ${T.line}`, fontSize: 14, color: T.faint, lineHeight: 1.6 }}>
          原型示意: Paint/Look 為 side menu 新增項目 (與 Camera Settings 同級)
        </div>
      </div>

      {/* 主工作區 (Main Stage Panel) */}
      <div style={{ flex: 1, padding: "16px 24px", minWidth: 0, background: T.page, overflow: "hidden", height: "100vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: "1350px", margin: "0 auto", height: "100%", minHeight: 0 }}>
          
          {/* 頂部標題 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0, flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "#fff" }}>Paint / Look</div>
              <div style={{ fontSize: 14, color: T.dim, marginTop: 3 }}>訊號級進階影像調整 · 與「攝影機設定 › 影像處理」的基本設定疊加作用</div>
            </div>
          </div>

          {/* 1. LIVE 預覽與場景檔主控制台 */}
          <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12, width: "100%", boxSizing: "border-box", flex: "1.25 1 0", minHeight: 0 }}>
            
            <div style={{ display: "flex", gap: 24, width: "100%", flex: 1, minHeight: 0 }}>
              
              {/* 左半部：影像預覽畫布與多模示波器 */}
              <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.line}`, background: "#000", flex: 1, minHeight: 0, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  
                  {/* 主要畫面 Canvas — 已修正為 React 物理屬性防抖動架構 */}
                  <canvas ref={preRef} width={SW} height={SH} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
                  <span style={{ position: "absolute", left: 12, top: 10, fontFamily: fMono, fontSize: 14, color: "rgba(255,255,255,.9)", textShadow: "0 1px 2px #000", fontWeight: 600, zIndex: 20 }}>
                    {bypass ? "● BYPASS" : "● LIVE(模擬畫面)"}
                  </span>
                  
                  {/* 按住看原始按鈕 */}
                  <button 
                    onMouseDown={() => setBypass(true)} 
                    onMouseUp={() => setBypass(false)} 
                    onMouseLeave={() => setBypass(false)} 
                    onTouchStart={() => setBypass(true)} 
                    onTouchEnd={() => setBypass(false)}
                    style={{ 
                      position: "absolute", right: 12, top: 10, padding: "4px 10px", fontSize: 14, cursor: "pointer", 
                      borderRadius: 5, border: bypass ? `1px solid ${T.blue}` : "1px solid rgba(255,255,255,0.25)", 
                      background: bypass ? "rgba(30,155,240,0.85)" : "rgba(22,24,27,0.65)", 
                      color: bypass ? "#fff" : "rgba(255,255,255,0.9)", fontFamily: fUI, 
                      backdropFilter: "blur(4px)", transition: "all .15s", zIndex: 20
                    }}
                  >
                    {bypass ? "原始畫面" : "按住看原始"}
                  </button>

                  {/* 示波器類型切換列 */}
                  <div style={{
                    position: "absolute", left: 12, bottom: 12, height: 32, boxSizing: "border-box",
                    background: "rgba(22, 24, 27, 0.75)", border: `1px solid ${T.line}`, borderRadius: 6,
                    padding: "0 8px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(4px)", zIndex: 20
                  }}>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>監看</span>
                    <Toggle on={showScope} onChange={setShowScope} />
                    {showScope && (
                      <div style={{ display: "flex", background: "#101216", border: `1px solid ${T.line}`, borderRadius: 5, padding: 2, gap: 2, alignItems: "center" }}>
                        {[["vector", "向量"], ["wave", "波形"]].map(([id, lb]) => (
                          <button 
                            key={id} 
                            onClick={() => setScope(id)} 
                            style={{ 
                              padding: "2px 8px", fontSize: 14, cursor: "pointer", borderRadius: 3, 
                              border: "none", background: scope === id ? T.blue : "transparent", 
                              color: scope === id ? "#fff" : T.dim, fontFamily: fUI 
                            }}
                          >
                            {lb}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 示波器 Canvas 渲染層 */}
                  {showScope && (
                    <div style={{
                      position: "absolute", right: 12, bottom: 12, zIndex: 20, borderRadius: 6,
                      overflow: "hidden", border: `1px solid ${T.line}`, boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                      background: "rgba(8,12,10,0.95)", display: "flex", flexDirection: "column", alignItems: "center", padding: "4px"
                    }}>
                      <canvas ref={scRef} width={scope === "vector" ? 140 : 190} height={140} style={{ display: "block", borderRadius: 4 }} />
                      <div style={{ fontSize: 14, color: T.dim, marginTop: 3, fontFamily: fUI, textAlign: "center" }}>
                        {scope === "vector" ? "向量示波器 (膚色線)" : "波形圖 (0-100%)"}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 右半部：場景快照存取面板 */}
              <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, alignSelf: "stretch", background: "rgba(0,0,0,0.18)", border: `1px solid ${T.line}`, borderRadius: 8, padding: "14px 16px", boxSizing: "border-box" }}>
                <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>場景存檔 (MAX 16)</span>
                  </div>

                  {/* 縮圖網格網頁 */}
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", paddingRight: 4, marginBottom: 8, alignItems: "start", alignContent: "start" }}>
                    <SceneTile thumb={stdThumb} name="Standard" factory active={activeScene === "std"} dirty={sceneDirty} onLoad={loadStandard} />
                    {scenes.map((s) => (
                      <SceneTile key={s.id} thumb={s.thumb} name={s.name} remark={s.remark} active={activeScene === s.id} dirty={sceneDirty} onLoad={() => loadScene(s)} />
                    ))}
                    {scenes.length < 16 && (
                      <button 
                        onClick={() => { setSaveOpen(true); setScName(""); setScRemark(""); }} 
                        style={{ 
                          width: "100%", padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", 
                          textAlign: "left", background: "transparent", border: `1.5px dashed ${T.line2}`, 
                          transition: "all .15s", boxSizing: "border-box", display: "block" 
                        }}
                      >
                        <div style={{ position: "relative", aspectRatio: "16/9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: T.dim }}>
                          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                        </div>
                        <div style={{ padding: "3px 4px 4px", fontSize: 14, fontWeight: 600, color: T.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
                          新儲存設定值
                        </div>
                      </button>
                    )}
                  </div>

                  {/* 管理按鈕 */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexShrink: 0 }}>
                    <button 
                      onClick={() => setLibOpen((v) => !v)} 
                      style={{ 
                        flex: 1, padding: "5px 0", fontSize: 14, cursor: "pointer", borderRadius: 6, 
                        border: `1px solid ${T.line2}`, background: "transparent", color: libOpen ? T.blue : T.dim, fontFamily: fUI 
                      }}
                    >
                      管理庫 ({scenes.length}/16)
                    </button>
                  </div>

                  {/* 寫入/更新與儲存按鈕 */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexShrink: 0 }}>
                    {sceneDirty && activeScene !== "std" && activeScene != null && (
                      <button 
                        onClick={() => { const s = scenes.find((x) => x.id === activeScene); if (s) updateScene(s); }} 
                        style={{ flex: 1, padding: "5px 0", fontSize: 14, cursor: "pointer", borderRadius: 6, border: `1px solid ${T.blueDark}`, background: "rgba(30,155,240,0.12)", color: T.blue, fontFamily: fUI }}
                      >
                        覆寫當前
                      </button>
                    )}
                    <button 
                      onClick={() => { setSaveOpen((v) => !v); setScName(""); setScRemark(""); }} 
                      disabled={scenes.length >= 16} 
                      style={{ 
                        flex: 1, padding: "5px 0", fontSize: 14, cursor: scenes.length >= 16 ? "default" : "pointer", 
                        borderRadius: 6, border: "none", background: scenes.length >= 16 ? T.line : T.blue, 
                        color: scenes.length >= 16 ? T.faint : "#fff", fontFamily: fUI 
                      }}
                    >
                      儲存設定值
                    </button>
                  </div>
                </div>

                {/* 另存快照的填寫表單 */}
                {saveOpen && (
                  <div style={{ padding: "8px 10px", borderRadius: 8, background: T.panel2, border: `1px solid ${T.blueDark}`, marginTop: 4, flexShrink: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                      <input 
                        autoFocus 
                        value={scName} 
                        onChange={(e) => setScName(e.target.value)} 
                        placeholder="場景名稱 (例: 主舞台)" 
                        maxLength={24}
                        style={{ background: "#101216", border: `1px solid ${T.line2}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "5px 8px", outline: "none", fontFamily: fUI }} 
                      />
                      <input 
                        value={scRemark} 
                        onChange={(e) => setScRemark(e.target.value)} 
                        placeholder="備註資訊" 
                        maxLength={48}
                        style={{ background: "#101216", border: `1px solid ${T.line2}`, borderRadius: 6, color: T.text, fontSize: 14, padding: "5px 8px", outline: "none", fontFamily: fUI }} 
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: 14, color: T.faint, marginRight: "auto" }}>自動擷取預覽快照</span>
                      <button onClick={saveNewScene} style={{ padding: "4px 10px", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 5, border: "none", background: T.blue, color: "#fff", fontFamily: fUI }}>儲存</button>
                      <button onClick={() => setSaveOpen(false)} style={{ padding: "4px 8px", fontSize: 14, cursor: "pointer", borderRadius: 5, border: `1px solid ${T.line2}`, background: "transparent", color: T.dim, fontFamily: fUI }}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 下方擴展的場景庫管理面版 */}
            {libOpen && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.line}`, width: "100%", flexShrink: 0, maxHeight: "140px", overflowY: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  <SceneCard 
                    thumb={stdThumb} name="Standard" remark="" factory active={activeScene === "std"} dirty={sceneDirty} onLoad={loadStandard}
                    summary={summarize(DEF)} expanded={expandedScene === "std"} onToggleExpand={() => setExpandedScene(expandedScene === "std" ? null : "std")}
                    actions={<MiniBtn onClick={loadStandard} primary>載入</MiniBtn>} 
                  />
                  {scenes.map((s) => (
                    <SceneCard 
                      key={s.id} thumb={s.thumb} name={s.name} remark={s.remark} time={s.savedAt} active={activeScene === s.id} dirty={sceneDirty} onLoad={() => loadScene(s)}
                      summary={summarize(s.data)} expanded={expandedScene === s.id} onToggleExpand={() => setExpandedScene(expandedScene === s.id ? null : s.id)}
                      actions={
                        <>
                          <MiniBtn onClick={() => loadScene(s)} primary>載入</MiniBtn>
                          <MiniBtn onClick={() => updateScene(s)}>覆寫</MiniBtn>
                          <MiniBtn onClick={() => deleteScene(s)}>刪除</MiniBtn>
                        </>
                      } 
                    />
                  ))}
                </div>
                <div style={{ fontSize: 14, color: T.faint, marginTop: 10, lineHeight: 1.6 }}>
                  Standard 為原廠基準值，不佔用 16 組儲存上限額度、不可修改刪除。原型僅為網頁端暫存模擬，實機將寫入機身 Flash。
                </div>
              </div>
            )}
          </div>

          {/* 2. 底部功能分頁選單與數值調整滑桿 */}
          <div style={{ display: "flex", gap: 16, width: "100%", flex: "0.75 1 0", minHeight: 0 }}>
            
            {/* 左側選單切換 (Block Selection Navigation) */}
            <div style={{ width: 160, flexShrink: 0, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 10px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
                {BLOCKS.map(([id, lb]) => (
                  <button 
                    key={id} 
                    onClick={() => setBlock(id)} 
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer", borderRadius: 7,
                      border: `1.5px solid ${block === id ? T.blue : T.line2}`, 
                      background: block === id ? "rgba(30,155,240,0.12)" : T.panel2,
                      transition: "all .15s", boxSizing: "border-box",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14.5, color: block === id ? T.blue : T.text, fontWeight: block === id ? 600 : 500 }}>{lb}</span>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: blockActive(id) ? T.green : T.line2 }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* 右側具體調整項 (Parameters Control Stage) */}
            <div style={{ flex: 1, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px", minWidth: 0, display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
                {renderBlock()}
              </div>
            </div>

          </div>
        </div>

        {/* 輕量快閃提示 */}
        {toast && (
          <div style={{ position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", background: "#222a31", border: `1px solid ${T.line2}`, color: T.text, fontSize: 14, padding: "8px 16px", borderRadius: 8, fontFamily: fUI, zIndex: 100 }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
