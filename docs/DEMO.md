# 二次面試 Demo 指南（瑞竣科技・網頁程式設計師／Web GIS）

## 0. 面試前一天的檢查清單

- [ ] `npm install && npm test`，確認 26 個測試全部通過
- [ ] `npm start`，打開 http://localhost:3000，把下面的 demo 流程完整走一遍
- [ ] **到 Mapbox 後台撤銷舊的 token**：舊版程式碼把 token 寫死，它還留在 git 歷史裡。weatherstack 的 key 也一起作廢
- [ ] 線上網址：https://weather-app-ten-iota-77.vercel.app （Vercel，正式分支 `swipe-compare`）。面試前先打開一次，四個比對案例各點一次，讓圖磚先載入
- [ ] 準備備案：面試現場網路不穩時，用筆電本機跑（`npm start`），並先截好幾張圖
- [ ] 每個檔案至少打開讀一遍，確認自己講得出每一段在做什麼

---

## 1. Demo 流程（約 5 分鐘）

**開場（30 秒）**
> 「這是我之前做的天氣查詢網站。這次我把它重構，並加上 Web GIS 的功能。技術上是 Node.js + Express 做後端、Handlebars 做伺服器端渲染，前端用原生 JavaScript 和 Leaflet。」

**① 搜尋（30 秒）**
- 搜尋 `Taipei`：先講結果卡、8 個指標、24 小時溫度圖和 7 天預報
- 再搜尋 `Paris, Texas`：
> 「Open-Meteo 的地理編碼只能用地名查，所以我把逗號後面的部分拿來當提示，在候選結果裡挑出符合的那一個。」

**② 地圖（重點，2 分鐘）**
- 打開圖層控制，切換衛星影像、街道圖、淺色底圖、地形圖
> 「底圖是 XYZ tile，網址裡的 `{z}/{x}/{y}` 是縮放等級和瓦片座標。」
- 指出地圖上的城市溫度標籤
> 「這是一個 GeoJSON 點圖層，來自我自己寫的 `/api/cities`。後端用一次 API 請求同時查 14 個城市，再轉成 FeatureCollection。要注意 GeoJSON 的座標順序是 `[經度, 緯度]`，Leaflet 則是 `[緯度, 經度]`。」
- **點一下中和區**（貴公司所在地）
> 「點地圖時，我會把點擊的座標送到後端，用 Nominatim 做反向地理編碼，把座標轉成地名。地名查詢和天氣查詢互不相依，所以用 `Promise.all` 平行處理。」
- 打開 Rain radar 圖層
> 「這是疊加在底圖上的 overlay 圖層。」

**②-a 搜尋與周圍天氣（30 秒）**
- 搜尋「土城」：右側抽屜滑出完整預報，地圖上中心與周圍 14 個點出現會動的天氣圖示和區名
> 「周圍天氣是一次 Open-Meteo 請求查 15 個點（`/api/nearby`），區名用反向地理編碼即時補上。中文地名 Open-Meteo 查不到，所以我用 OpenStreetMap Nominatim 當備援。」
- 點地圖空白處：字卡和抽屜一起收起，不會誤查別的地方

**②-b 災前災後比對（主打，1.5 分鐘）**
- **文字 → 災害（GeoAI 的迷你版）**：比對模式的搜尋框可以輸入關鍵字、整段新聞或新聞網址，下方有四個範例可以直接點：
  - 「🔥 澳洲森林大火」「🔥 洛杉磯 Eaton 大火」：關鍵字比對
  - 「📰 新聞：馬太鞍溪堰塞湖」（公視）、「📰 News: Australia bushfires」（RNZ）：後端讀新聞標題再判斷
> 「這是把非結構化文字轉成空間資訊的小例子，跟貴公司 GeoAI Maker 是同一類問題。我用的是可解釋的關鍵字權重規則，之後可以換成 LLM，API 不用改。後端讀網址時有擋內網位址和轉址，避免 SSRF。」
- 搜尋框也有自動完成（Photon / OpenStreetMap），中文查詢台灣地點優先，例如輸入「政治」會先出現政治大學
- 點面板上的「🛰️ 災前災後比對」切換模式：天氣圖示和抽屜全部隱藏，只剩衛星影像和拉桿
- 預設案例依序展示：
  1. **馬太鞍溪堰塞湖**（2025/6/15 對 9/11，NASA HLS 30 m）：崩塌地與藍綠色湖面
  2. **溢流後的光復鄉**（6/15 對 10/11）：河道變寬、大片泥沙
  3. **洛杉磯 Eaton 大火 Altadena**（Esri 高解析約 30 cm，2022 對 2025-08）：整片住宅燒成空地 ← 最震撼，收尾用
  4. **澳洲 Longwood 森林大火**（2026/1/4 對 1/24）：大片燒毀區
- 點地圖任一處收起面板，拖曳中間拉桿
- 技術說明：
> 「兩期影像各放在自己的 Leaflet pane，依分隔線位置用 CSS `clip` 裁切；地圖一平移 pane 座標就會變，所以每次 move/zoom 用 `containerPointToLayerPoint` 重新換算。元件是自己寫的，沒有用外掛。」
> 「日期是我寫程式算過每天的雲量才挑的；也查了 Esri 的影像 metadata，發現花蓮的高解析影像停在 2021 年，所以台灣案例用 NASA 30 m 影像，洛杉磯用 Esri 高解析。」
- 收尾（帶到瑞竣的業務）
> 「免費影像只到 10～30 m，只看得到燒毀範圍；Esri 高解析才看得到每一棟房子。這就是貴公司代理的 Maxar、Planet 商用影像的價值，這個元件換成那邊的圖磚來源就能直接用。」

**③ RWD（30 秒）**
- 開 DevTools 切到手機尺寸：指標從 4 欄變成 2 欄，24 小時圖改成可以橫向滑動

**④ 程式架構（1 分鐘）**
打開 `src/` 資料夾：
> 「我把程式分成 route → controller → service 三層。controller 是純函式，不依賴 Express，所以能直接寫單元測試。外部 API 會透過依賴注入換成假資料，測試時不需要網路。」

接著跑 `npm test`，讓面試官看到測試全部通過。

**⑤ 收尾：重構了什麼（30 秒）**
- 原本 API key 直接寫在程式碼裡，現在改用免金鑰的服務，repo 裡沒有任何機密
- 原本使用已停止維護的 `request` 套件，現在改用 Node 內建的 `fetch`，並加上逾時處理
- 原本錯誤也回傳 200，現在會回正確的狀態碼（400、404、502、504）
- 加上 10 分鐘的記憶體快取，以及 XSS 防護（第三方回傳的地名只用 `textContent` 顯示）

---

## 2. 職缺要求和這個專案的對應

| 職缺要求 | 怎麼回答 |
| --- | --- |
| HTML / CSS / JavaScript | 整個前端都是原生寫的，沒有框架：CSS Grid、CSS 變數、RWD、SVG 圖表 |
| Leaflet、Mapbox、GIS | Leaflet 圖層控制、GeoJSON、tile layer、反向地理編碼。舊版也用過 Mapbox Geocoding API |
| RWD | 用 media query 調整 grid 欄數，並在手機上隱藏不必要的裝飾 |
| ASP.NET C# | 見下方「架構對應」，說明概念相同，願意立刻學 |
| MS SQL（DML） | 見下方 SQL 範例 |
| 系統維護 | 這次的重構本身就是維護：修 bug、更新相依套件、拿掉寫死的機密、補測試 |

### 架構對應：Express ↔ ASP.NET Core

| 這個專案 | ASP.NET Core |
| --- | --- |
| `app.get("/api/weather", ...)` | `[HttpGet("api/weather")]`，寫在 `WeatherController` 裡 |
| `controllers/weather.js` | `WeatherController : ControllerBase` |
| `services/forecast.js` | `IForecastService` 和它的實作類別 |
| `createApp({ geocode, forecast })` 注入 | `builder.Services.AddScoped<IForecastService, ForecastService>()`（內建 DI） |
| `lib/http.js` 的 `fetch` | `HttpClient` / `IHttpClientFactory` |
| `lib/cache.js` | `IMemoryCache` |
| Handlebars 模板 | Razor (`.cshtml`) |
| `node:test` | xUnit / NUnit |

> 「語言不同，但分層、依賴注入、快取這些設計概念是一樣的。我會先從 ASP.NET Core 的 Web API 和 Razor 開始上手。」

### 如果要加資料庫（MS SQL）：搜尋紀錄

```sql
CREATE TABLE SearchLog (
  Id INT IDENTITY PRIMARY KEY,
  Query NVARCHAR(100) NOT NULL,
  Lat DECIMAL(9,6), Lon DECIMAL(9,6),
  SearchedAt DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- INSERT：每次查詢都寫一筆
INSERT INTO SearchLog (Query, Lat, Lon) VALUES (@query, @lat, @lon);

-- SELECT：最近 7 天最熱門的 10 個地點
SELECT TOP 10 Query, COUNT(*) AS Times
FROM SearchLog
WHERE SearchedAt >= DATEADD(day, -7, SYSUTCDATETIME())
GROUP BY Query
ORDER BY Times DESC;

-- UPDATE / DELETE：修正資料、清除 90 天前的紀錄
UPDATE SearchLog SET Query = N'Taipei' WHERE Query = N'taipei';
DELETE FROM SearchLog WHERE SearchedAt < DATEADD(day, -90, SYSUTCDATETIME());
```

重點：一定要用參數化查詢（`@query`），不要用字串拼接，避免 SQL injection。
加分：MS SQL 有 `geography` 型別，可以做空間查詢，例如「找出距離某點 10 公里內的紀錄」：`geography::Point(@lat, @lon, 4326).STDistance(Location) < 10000`。

---

## 3. 可能被問的問題

**GIS**
- **WGS84 和 Web Mercator 差在哪？** WGS84（EPSG:4326）是經緯度，GPS 和 GeoJSON 都用它。Web Mercator（EPSG:3857）是網路地圖瓦片使用的投影，以公尺為單位，越靠近兩極變形越大。Leaflet 輸入時用經緯度，顯示時用 3857。台灣常見的還有 TWD97（EPSG:3826），政府的圖資常用它。
- **GeoJSON 的座標順序？** `[lon, lat]`，但 Leaflet 的 `L.latLng` 是 `(lat, lon)`。這是常見的 bug 來源，我在測試裡也有檢查這一點。
- **Tile 是什麼？** 把地圖切成 256×256 的圖片，用 z/x/y 定位。縮放等級每加 1，瓦片數量變成 4 倍。
- **為什麼不用 leaflet-side-by-side？** 自己寫可以完全掌握 pane、clip 和座標轉換，也少一個相依套件；面試時也講得出原理。
- **HLS 是什麼？** NASA 把 Landsat 8/9 和 Sentinel-2 的影像校正成一致的 30 m 地表反射率，幾乎每 2～3 天就有一張，但有雲的日子看不到地面。
- **向量圖層和網格圖層的差異？** 城市點是向量圖層（GeoJSON），可以互動、可以改樣式；雷達圖是網格瓦片。
- **點很多時效能會變差怎麼辦？** 可以用 marker cluster、在伺服器端只回傳目前範圍內的點（bbox 查詢），或改用向量瓦片。

**後端**
- **快取為什麼用座標四捨五入當 key？** 小數點 2 位大約是 1 公里，附近的點可以共用同一筆快取，減少對外部 API 的呼叫。
- **快取放在記憶體有什麼缺點？** 重啟後就會消失，多台機器之間也不共用。要擴充時可以改用 Redis。
- **為什麼要設逾時？** 外部服務卡住時，不讓使用者一直等，也避免連線堆積。
- **為什麼不把錯誤細節回傳給前端？** 避免洩漏內部資訊。詳細內容記錄在 log 裡就好。

**前端**
- **連續快速搜尋時怎麼避免舊結果蓋掉新結果？** 用 `AbortController` 取消前一個還沒完成的請求。
- **XSS 怎麼防？** 第三方回傳的地名一律用 `textContent` 或建立 DOM 節點來顯示，不用 `innerHTML` 拼字串。

**如果被問到「這是你自己寫的嗎？」**
照實說：原始版本是學 Node.js 時自己做的，這次是為了面試重構，過程中有用 AI 工具協助，但每個改動你都理解，也能說明為什麼要這樣改。誠實說明，再加上能講清楚細節，會比假裝全部獨立完成更有說服力。
