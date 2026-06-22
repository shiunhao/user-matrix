import os

walkthrough_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\walkthrough.md"
task_path = r"C:\Users\v002651\.gemini\antigravity\brain\843e0514-4c94-4c76-b23c-7377688f0926\task.md"

if os.path.exists(walkthrough_path):
    with open(walkthrough_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    new_wt_31 = """### 31. 完美對齊 Live View 與 Camera Settings 頁面的 16px 底部留白 (Padding)
* **改了什麼**：
  - **Flex-1 彈性預覽容器重構**：移除先前 `Live View` 與 `Camera Settings` 頁面中 Live 預覽畫面寫死的最大高度與寬度計算式，將外層重構為 `flex: 1`、`minHeight: 0`、`width: "100%"` 的自適應黑色大容器。這讓預覽容器在任何視窗尺寸下，均能自動且完美地填滿所有的剩餘垂直空間。
  - **16:9 內層最大化自適應**：在容器內部，我們置入了 `maxWidth: "100%"`, `maxHeight: "100%"`, `aspectRatio: "16 / 9"` 的內層預覽區。這在不溢出的前提下，最大化地將 16:9 的視訊畫面在黑色背景中居中縮放，完美解決了先前預覽圖壓得太小導致下方出現巨大黑色空白，或是在低高度下將面板擠壓溢出的問題。
  - **控制面板精確推底**：整個 wrapper 由於彈性填充而達成了完美的 `100%` 物理高度，使得底部的控制面板被自然且精確地推向底部。這讓控制面板底部與網頁底邊的留白在任何解析度下都**精確、固定為 16px**（與 `Paint / Look` 頁面完全一致），且控制面板本身的高度與內容大小不發生任何改變。"""

    if "### 31." in content:
        start_idx = content.find("### 31.")
        end_idx = content.find("\n---", start_idx)
        if start_idx != -1 and end_idx != -1:
            content = content[:start_idx] + new_wt_31 + "\n" + content[end_idx:]
    else:
        end_idx = content.find("---", content.find("### 30."))
        if end_idx != -1:
            content = content[:end_idx] + new_wt_31 + "\n\n" + content[end_idx:]

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
  - [x] 放大 Canvas 色環外半徑至 145px 並重新映射 node 軌跡（中點 119.75，振幅 25.25），使其完全垂直、水平填滿 290px `aver-wheel-main-container` Rose。
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
  - [x] 在右側面板新增清楚直觀的色彩微調詳細操作引聯說明文字。
  - [x] 修正 `Live View` 與 `Camera Settings` 頁面在低高度視窗下預覽圖過大造成控制面板 Overflow 的問題，引進高度連動的響應式自適應 `maxWidth`（`100vh - 420px`）並水平置中。
  - [x] 對齊 `Live View` 與 `Camera Settings` 的底部 padding 與 `Paint / Look` 一致（統一 gap 爲 10 且預覽圖最大高度限制調整為 `100vh - 460px`），確保控制面板 100% 原始大小不變的狀態下吸收全部高度收縮，杜絕任何溢出。
  - [x] 重構預覽圖為彈性 Flex 填充容器與 16:9 內層最大化自適應佈局，將底部的控制面板自然推至最底，在維持控制面板大小不變的前提下，使面板與底邊的距離在任何螢幕解析度下均精確、固定為 **16px**（與 Paint/Look 頁面完全一致），消除所有溢出與大塊黑色空缺。
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
