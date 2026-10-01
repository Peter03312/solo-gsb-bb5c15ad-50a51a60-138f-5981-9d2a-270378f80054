# 🌿 PhytoMeasure · 植物显微切片测量 Web 应用

在浏览器中上传植物显微切片图片，完成像素—微米定标后，圈选多个细胞的外轮廓及其孔洞，
自动计算**扣除孔洞后的净面积（μm²）**与**含孔洞边界的总周长（μm）**；
还可圈选多个**命名取样视野**（外环 + 可选孔洞），按视野统计**细胞密度（个/mm²）**，
并可发布为不可变报告、导出**标注 PNG**、**测量 CSV** 与独立的**视野统计 CSV**。

- 技术栈：Node.js（Express）+ SQLite（better-sqlite3）+ 原生 Canvas 前端
- 图片与数据**全部本地保存**（无任何外部服务依赖）：
  - 数据库：`data/app.db`
  - 原始图片：`data/images/`
  - 发布时的图片快照：`data/snapshots/`
  - 标注 PNG / CSV 在导出时实时生成

## 功能说明

1. **图片上传**：支持 PNG / JPEG / WebP（≤ 30 MB），读取真实像素尺寸。
2. **标尺定标**：在原图上点选**两个不同的像素点**，输入它们的实际微米距离，
   得到每像素微米数（μm/px）。两点重合、坐标越界、距离非正数均会被拒绝，且整次修改不生效。
3. **细胞轮廓**：可圈选多个细胞外轮廓，每个细胞可包含多个孔洞。
   - 轮廓不得**自交/自接触**，顶点不得**越出图片**；
   - 孔洞必须**严格位于**所属外轮廓内部（不能贴着外轮廓边界）；
   - 同一细胞的孔洞之间**不得接触或重叠**；
   - 任意一个对象不合法时，服务端会指出具体细胞/孔洞编号与原因，**整批轮廓保存不生效**。
4. **测量结果**：
   - 净面积 =（外轮廓面积 − 全部孔洞面积）× (μm/px)²，单位 **μm²**；
   - 总周长 =（外轮廓周长 + 全部孔洞周长）× μm/px，单位 **μm**；
   - 缩放、平移视图只改变显示，不改变任何测量值。
5. **重新定标**：草稿中的所有轮廓立即按新比例重算测量值。
6. **发布与乐观并发**：
   - 发布会冻结当时的**图片副本、标尺、轮廓与测量结果**，之后修改草稿不影响已发布报告；
   - 发布请求必须携带**读取时的草稿版本号**；期间草稿被改动（版本过期）时请求被拒绝（HTTP 409），
     页面会自动拉取最新草稿，需确认后重新发布。
7. **导出**：在「已发布报告」页勾选报告，可导出
   - 单份或多份合并的**测量 CSV**（UTF-8 BOM，Excel 直接可读）；
   - 单份**标注 PNG**（彩色细胞轮廓、红色虚线孔洞、细胞编号与青色标尺）；
   - 多份报告的 **ZIP**（每份一张标注 PNG + 一份 CSV，外附汇总 CSV）。
8. **报告比较（基线 ↔ 复测）**：在「报告比较」页选择**两份不同**的已发布报告，
   先点基线侧一个细胞、再点复测侧一个细胞，**手动**建立一对一配对
   （**同名细胞不会自动配对**；已配对细胞从两侧待选列表移除，可随时「解除」）。
   - 比较只读取两份报告**冻结的定标与测量值**：每对细胞给出净面积、总周长的
     **两侧数值、带符号差值（复测 − 基线）与相对基线变化率**；未配对细胞在两侧分别列出。
   - 基线值为 **0** 时变化率显示 / 导出为 **「不可计算」**（差值仍给出）。
   - 保存校验整批原子生效：**报告不存在、两侧相同、配对重复（同一细胞出现多次）、
     细胞不存在**任一种情况都会被拒绝，**整次保存不生效**。
   - 修改比较记录必须携带**读取时版本号**；期间被他人改动（版本过期）时返回 HTTP 409
     与当前版本，页面自动加载最新版本，过期修改不写入。
   - 可导出与页面分区、数值完全一致的**比较 CSV**（UTF-8 BOM）。
   - 比较记录保存后即与草稿、后续发布解耦：**草稿后续改动或另发新报告都不改变已存比较**；
     比较记录创建时选定的两份报告不可更换。
9. **取样视野与细胞密度统计**：在草稿中可圈定多个**命名取样视野**，每个视野由
   **不自交的外环**与**可选孔洞**构成。
   - **归属规则**：细胞以**扣除孔洞后的净区域质心**归属——质心**严格落在**视野净区域
     （外环内部、且不在孔洞内、不压任何边界）才计入，**边界不计入**；
     **视野重叠时同一细胞可被多个视野重复计数**；**净面积为零（退化）的细胞不计入**。
   - **已定标**时，每个视野展示：**净面积（mm²）、细胞数、每 mm² 细胞密度、
     计入细胞的净面积总和（mm²）**。
   - **未定标**时保留视野与细胞数，净面积 / 密度 / 计入面积总和三列显示 **「待定标」**。
   - **细胞轮廓变动或重新定标后自动重算**；视野本身的增删改保存后同样重算。
   - 视野**越界、自交、孔洞不严格位于外环内或彼此接触重叠、净面积非正**都会指出具体
     视野/孔洞编号并**整批拒绝保存**（与细胞轮廓一致的原子语义）；携带过期版本号同样
     按**草稿冲突（HTTP 409）**处理。
   - **发布冻结视野与统计**：报告冻结发布当时的视野与密度结果，之后改草稿不影响报告；
     **旧报告缺少视野时按空列表读取**。报告页与独立的**视野统计 CSV**展示的是**同一份冻结结果**；
     原**测量 CSV** 与报告比较结果**保持原义不变**。

## 配置项

本轮（取样视野与细胞密度）**未引入新的环境变量或新的外部依赖**，沿用既有配置；
视野数据保存在同一个 SQLite 数据库中：草稿在 `images.fields`、发布时冻结到
`reports.fields`（启动时自动为旧库补列，无需手动迁移；旧报告按空视野列表读取）。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 容器/服务监听端口 |
| `DATA_DIR` | `./data`（Docker 中为 `/app/data`） | SQLite、原始图片、快照的保存目录（比较记录同在 `app.db` 内） |
| `HOST_PORT` | `8080` | 仅 Compose 使用：宿主机映射端口 |

## 一条命令启动（Docker Compose）

```bash
docker compose up -d --build
```

启动后浏览器访问：

```
http://localhost:8080
```

若 8080 端口被占用：

```bash
HOST_PORT=8088 docker compose up -d --build
# 然后访问 http://localhost:8088
```

数据持久化在 Docker 命名卷 `phytomeasure-data` 中。
若希望直接在宿主机目录查看数据，可把 `docker-compose.yml` 中的卷改为绑定挂载：

```yaml
volumes:
  - ./data:/app/data
```

停止与查看日志：

```bash
docker compose down
docker compose logs -f
```

## 非 Docker 方式运行（需 Node.js ≥ 20）

```bash
npm install
npm start
# 访问 http://localhost:8080
```

## 使用步骤（网页操作）

1. 首页上传图片，自动进入编辑器；
2. 选择 **📏 定标点工具**，在图上单击两个点，在弹窗中输入实际距离（μm）；
3. 选择 **⭕ 画细胞外轮廓**：单击逐个加点，双击（或回车）闭合；
4. 在细胞列表中选中某个细胞，用 **🕓 为选中细胞画孔洞** 工具绘制其孔洞；
5. 点击 **保存全部轮廓**——若有非法轮廓/孔洞，顶部红条会指出具体对象，本次保存整体不生效；
6. 右侧测量表实时显示净面积与总周长，滚轮缩放、拖拽平移不影响数值；
7. 用 **🔲 画取样视野外环 / 🟣 为选中视野画孔洞** 圈定一个或多个命名视野（可在列表中改名），
   点击 **保存全部视野**；下方「视野细胞密度统计」表按视野给出净面积（mm²）、细胞数、
   每 mm² 密度与计入细胞净面积总和（未定标时后三项相关列显示「待定标」，细胞数照常统计）；
8. 点击 **发布当前草稿为报告**，在「已发布报告」中查看冻结的细胞测量与视野密度统计，
   并导出 PNG / 测量 CSV / 视野统计 CSV；
9. 重复以上流程再发布一份报告（如同一批切片的复测）；
10. 进入 **报告比较**，点击「＋ 新建报告比较」，分别选择基线报告与复测报告，
   点击「载入两侧细胞」；先点基线侧一个未配对细胞、再点复测侧一个未配对细胞即完成一对配对，
   同名细胞不会自动配对；填标题（可留空自动生成）后「保存比较记录」；
10. 在比较记录页查看每对细胞净面积 / 总周长的两侧值、带符号差值与相对基线变化率
    （基线为 0 显示「不可计算」），两侧未配对细胞分别列出；可「解除」配对后携带当前版本保存，
    版本过期会被拒绝并自动加载当前版本；点击「导出比较 CSV」下载与页面一致的 CSV。

## 目录结构

```
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server/
│   ├── index.js       # Express API：上传/定标/轮廓/发布/导出/报告比较
│   ├── db.js          # SQLite 表结构与初始化（启动自动建表）
│   ├── geometry.js    # 几何校验与面积/周长/净区域质心/严格点包含（服务端最终校验）
│   ├── fields.js      # 取样视野：质心归属、净面积/细胞数/密度/计入面积统计
│   ├── compare.js     # 报告比较：手动一对一配对校验、冻结值差值/变化率视图
│   ├── render.js      # sharp + SVG 渲染标注 PNG
│   └── exporter.js    # CSV（测量/汇总/比较/视野统计）与 ZIP 导出
├── public/            # 前端（原生 JS，无需构建）
├── test-geometry.js   # 几何自测（npm test）
├── test-compare.js    # 报告比较自测（npm test）
├── test-fields.js     # 取样视野与密度统计自测（npm test）
└── data/              # 运行后生成：app.db、images/、snapshots/
```

## 报告比较 HTTP 接口

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/comparisons` | 比较记录列表（标题、两侧报告、配对数、版本、时间） |
| `POST /api/comparisons` | 新建：`{baselineReportId, retestReportId, title?, pairs:[{baselineCellKey, retestCellKey}]}`；报告不存在/两侧相同/配对重复/细胞不存在 → 400，整次不生效 |
| `GET /api/comparisons/:id` | 比较结果：两侧冻结定标、逐对细胞两侧数值/带符号差值/变化率（基线 0 为 `不可计算`）、两侧未配对细胞 |
| `PUT /api/comparisons/:id` | 修改标题与配对（两侧报告不可更换），须携带读取时 `version`；过期 → 409 并返回 `currentVersion`，整次修改不写入 |
| `GET /api/comparisons/:id/csv` | 导出与页面一致的比较 CSV（UTF-8 BOM） |

## 取样视野与细胞密度 HTTP 接口

所有环均为像素坐标点数组 `[{x,y},...]`（至少 3 点，按闭合环处理）；
视野 `fields` 结构：`{id?, name?, outer:[点], holes:[[点], ...]}`。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/images/:id` | 草稿详情现包含 `fields` 与 `fieldStats`（按当前 calib/cells 实时计算；未定标时各面积/密度列为 `null`、文本为「待定标」） |
| `PUT /api/images/:id/fields` | 整批保存视野：`{version, fields:[...]}`；越界/自交/孔洞不严格位于外环内或彼此接触重叠/净面积非正 → 400 且**整批不生效**；版本过期 → 409（返回 `currentVersion`） |
| `POST /api/images/:id/publish` | 发布时**同时冻结视野与统计**（无额外参数；响应中的 `report.fields` / `report.fieldStats` 即冻结值） |
| `GET /api/reports/:id` | 报告详情含冻结的 `fields` 与 `fieldStats`；旧报告 `fields` 为 `[]`、`fieldStats.fields` 为空 |
| `GET /api/reports/:id/fields-csv` | 导出**视野统计 CSV**（UTF-8 BOM），与报告页 `fieldStats` 为同一份冻结结果；原 `/api/reports/:id/csv` 测量 CSV 与比较 CSV 含义不变 |

`fieldStats.fields[]` 字段（草稿与报告同构）：

```jsonc
{
  "key": "视野 id（历史无 id 用 #序号）",
  "name": "视野名称",
  "holes": 0,
  "cellCount": 1,                 // 质心严格落入净区域的细胞数（重叠视野可重复计数）
  "countedCellKeys": ["<cellId>"],
  "calibrated": true,
  "netAreaMm2": 0.0064,           // 视野净面积；未定标为 null
  "densityPerMm2": 156.25,        // 细胞数 / 净面积(mm²)；未定标为 null
  "countedCellAreaMm2": 0.0004,   // 计入细胞的净面积总和；未定标为 null
  "netAreaText": "0.0064",        // 未定标时为 "待定标"
  "densityText": "156.25",
  "countedCellAreaText": "0.0004"
}
```

### 调用示例（curl）

```bash
# 1) 保存两个命名视野（第二个带孔洞）；需携带读取到的草稿 version
curl -sS -X PUT http://localhost:8080/api/images/$IMAGE_ID/fields \
  -H 'Content-Type: application/json' \
  -d '{
    "version": 3,
    "fields": [
      { "name": "视野A", "outer": [{"x":10,"y":10},{"x":90,"y":10},{"x":90,"y":90},{"x":10,"y":90}], "holes": [] },
      { "name": "视野B",
        "outer": [{"x":100,"y":100},{"x":190,"y":100},{"x":190,"y":190},{"x":100,"y":190}],
        "holes": [[{"x":140,"y":140},{"x":160,"y":140},{"x":160,"y":160},{"x":140,"y":160}]] }
    ]
  }'
# 200 -> 返回最新草稿（version+1，fieldStats 已重算）
# 400 -> {"error":"视野「视野B」 的孔洞 1：必须严格位于所属视野外环内部 …"}（整批未写入）
# 409 -> {"error":"草稿已过期…","currentVersion":5}

# 2) 读取草稿实时视野统计（未定标时面积/密度为 null、*Text 为「待定标」）
curl -sS http://localhost:8080/api/images/$IMAGE_ID | jq '.fieldStats.fields[]'

# 3) 发布（冻结细胞 + 视野 + 统计）
curl -sS -X POST http://localhost:8080/api/images/$IMAGE_ID/publish \
  -H 'Content-Type: application/json' -d '{"version": 4}'

# 4) 报告页同源的冻结视野统计 CSV（UTF-8 BOM）
curl -sS -OJ http://localhost:8080/api/reports/$REPORT_ID/fields-csv
```

### 调用示例（Node 18+ 全局 fetch）

```js
const res = await fetch(`http://localhost:8080/api/images/${imageId}/fields`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ version, fields: [{ name: '视野A', outer, holes: [] }] })
});
if (res.status === 409) {
  const { currentVersion } = await res.json();   // 草稿冲突：重新拉取后携带新版本重试
} else if (!res.ok) {
  const { error } = await res.json();            // 整批校验失败，无任何写入
  throw new Error(error);
}
const draft = await res.json();
console.log(draft.fieldStats.fields);            // [{name, cellCount, netAreaMm2, densityPerMm2, ...}]
```
