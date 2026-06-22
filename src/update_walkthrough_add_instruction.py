import os

walkthrough_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\walkthrough.md"
task_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\task.md"

if os.path.exists(walkthrough_path):
    with open(walkthrough_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    new_wt_28 = """### 28. 新增右側面板「選擇要調整的色相軸」詳細操作引導說明文字
* **改了什麼**：
  - **新增引導說明**：在右側面板未選中色彩軸的預設狀態下，於「選擇要調整的色相軸」小標題正下方，置入了一段清楚明暸的引導說明：「`請點擊左側色相環上的節點（如 Red, Yellow 等）或下方已調整的晶片標籤，即可進入該色彩軸進行詳細微調。`」。
  - **精緻化排版**：採用 `12.5px` 精緻小字與溫和灰色（`T.dim`），搭配適度的行高（`1.6`）與下邊距（`14px`），既能完美指引使用者如何操作，又與 AVer 整體簡約高質感的介面設計風格完美融合。"""

    if "### 28." in content:
        start_idx = content.find("### 28.")
        end_idx = content.find("\n---", start_idx)
        if start_idx != -1 and end_idx != -1:
            content = content[:start_idx] + new_wt_28 + "\n" + content[end_idx:]
    else:
        end_idx = content.find("---", content.find("### 27."))
        if end_idx != -1:
            content = content[:end_idx] + new_wt_28 + "\n\n" + content[end_idx:]

    with open(walkthrough_path, "w", encoding="utf-8", errors="ignore") as f:
        f.write(content)
    print("SUCCESS: walkthrough.md updated.")

if os.path.exists(task_path):
    with open(task_path, "r", encoding="utf-8", errors="ignore") as f:
        task_content = f.read()

    new_task = """- [x] 色相環高度自適應 Panel 的百分比與響應式縮放 (V4_1)
  - [x] 移除 `aver-wheel-layout-shell` 的固寬固高，改為佔 Panel 高度 **`100%`** 並透過 `aspectRatio: "1 / 1"` 維持完美正圓形，使其垂直極限填滿。
  - [x] 引進 React `ResizeObserver` 實時動態監聽 shell 高度，藉此調整 scale 比例，完美貼合 Panel 物理空間。
  - [x] 精心調校動態縮放公式 `height / 298`，最外圍節點在任何高度均安全防護，保留極小邊界安全距離並杜絕 overflow 裁剪。
  - [x] 放大 Canvas 色環外半徑至 145px 並重新映射 node 軌跡（中點 119.75，振幅 25.25），使其完全垂直、水平填滿 290px `aver-wheel-main-container`。
  - [x] 壓矮控制面板高度配比至 `0.95` 並解除色環多層父容器的 overflow 裁剪限制，保證色環大小不變 of 狀態下，稍微壓矮 panel 且 100% 杜絕裁切。
  - [x] 鎖定色相環 layout-shell 寬度為 `290px` 並移除折行，徹底消除 focus 前後色環大小縮水與位置跳動之問題。
  - [x] 為 Canvas 實體色輪加上 GPU 加速的雙態 drop-shadow 光暈（非 focus 散發白光，focus 散發同色炫光）與 transition 漸變動畫。
  - [x] 實作 node 節點背景色明度隨 Saturation 降低同步變暗（從 0.95 降至 0.21 呈暗灰色），並對應將文字在暗底自动切換為高對比白字。
  - [x] 補回彩色環中線緩慢旋轉的圓形虛線圈（inset 34，35秒無限旋轉），並高亮當前選中軸的指針虛線（同色發光且加粗），使其隨拖曳拉伸與旋轉。
  - [x] 將 6 色相軸的名稱還原回經典縮寫（R, YL, G, CY, B, MG），保持節點佈局簡潔。
  - [x] 將 node 點背景色飽和度（nodeSat）基準整體微調提升 10%（從 0.56 升為 0.66）。
  - [x] 於 focus 狀態下將右側控制面板標題與色輪中央大字體改為英文全稱（Yellow 且移除基準度數），並實作字體大小自適應防折行。
  - [x] 將原廠預設場景名稱從「Standard」全面更名為「AVer」。
  - [x] 移除色相環節點上的「橘色已調整」標記（橘色小點、已調整橘色邊框樣式）並刪除操作面板的「橘點 = 已調整」說明文字。
  - [x] 重構「已調整的軸」標籤為精美膠囊晶片 (Chip) 樣式，包含色相英文全名（不縮寫）、HSL 色彩指示點與一鍵單軸歸零 ✕ 按鈕。
  - [x] 依照使用者回饋，將「已調整的軸」標題文字以及 Chip 標籤（包括內部 Padding、色彩指示點、名稱、數值、✕按鈕）按比例整體放大。
  - [x] 在右側面板新增清楚直觀的色彩微調詳細操作引導說明文字。
  - [x] 部署與發布至 gh-pages 網址。"""

    if "- [x] 色相環高度自適應" in task_content:
        start_idx = task_content.find("- [x] 色相環高度自適應")
        end_idx = task_content.find("\n-", start_idx + 20)
        if end_idx == -1:
            end_idx = len(task_content)
        task_content = task_content[:start_idx] + new_task + task_content[end_idx:]

    with open(task_path, "w", encoding="utf-8", errors="ignore") as f:
        f.write(task_content)
    print("SUCCESS: task.md updated.")
