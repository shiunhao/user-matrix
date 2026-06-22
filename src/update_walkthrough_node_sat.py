import os

walkthrough_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\walkthrough.md"
task_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\task.md"

if os.path.exists(walkthrough_path):
    with open(walkthrough_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    new_wt_22 = """### 22. 微調提升 node 節點之整體飽和度 +10%
* **改了什麼**：
  - **上調飽和度基準**：將 node 節點背景色的飽和度計算公式的基準值由 `0.56` 提高至 **`0.66`**，即整體上調了 10% 飽和度：
    - `nodeSat = Math.min(1.0, 0.66 + (nodeSatVal / 99) * 0.44)`
  - **視覺效果**：現在當 node 點位於中間或中高飽和度區時，其背景色看起來會更加鮮明亮麗約 10%，而拉至最內環（低飽和度）時的飽和度下限也由 `12%` 稍微升溫至 `22%`，色調更具質感。"""

    if "### 22." in content:
        start_idx = content.find("### 22.")
        end_idx = content.find("\n---", start_idx)
        if start_idx != -1 and end_idx != -1:
            content = content[:start_idx] + new_wt_22 + "\n" + content[end_idx:]
    else:
        end_idx = content.find("---", content.find("### 21."))
        if end_idx != -1:
            content = content[:end_idx] + new_wt_22 + "\n\n" + content[end_idx:]

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
  - [x] 壓矮控制面板高度配比至 `0.95` 並解除色環多層父容器 the overflow 裁剪限制，保證色環大小不變的狀態下，稍微壓矮 panel 且 100% 杜絕裁切。
  - [x] 鎖定色相環 layout-shell 寬度為 `290px` 並移除折行，徹底消除 focus 前後色環大小縮水與位置跳動之問題。
  - [x] 為 Canvas 實體色輪加上 GPU 加速的雙態 drop-shadow 光暈（非 focus 散發白光，focus 散發同色炫光）與 transition 漸變動畫。
  - [x] 實作 node 節點背景色明度隨 Saturation 降低同步變暗（從 0.95 降至 0.21 呈暗灰色），並對應將文字在暗底自動切換為高對比白字。
  - [x] 補回彩色環中線緩慢旋轉的圓形虛線圈（inset 34，35秒無限旋轉），並高亮當前選中軸的指針虛線（同色發光且加粗），使其隨拖曳拉伸與旋轉。
  - [x] 將 6 色相軸的名稱還原回經典縮寫（R, YL, G, CY, B, MG），保持節點佈局簡潔。
  - [x] 將 node 點背景色飽和度（nodeSat）基準整體微調提升 10%（從 0.56 升為 0.66）。
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
