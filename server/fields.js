'use strict';

// 取样视野细胞密度统计
//
// 归属规则：细胞以「扣除孔洞后的净区域质心」归属；质心严格落在视野净区域
// （外环内部且不在孔洞内、不压任何边界）才计入；边界不计入；视野重叠时同一
// 细胞可被多个视野重复计数；净面积为零的细胞不计入。
//
// 统计与冻结：统计值全部由冻结数据（calib / cells / fields）即时计算——草稿与
// 已发布报告同一套代码，因此发布后结果恒定；细胞轮廓变动或重新定标后重算。
// 旧报告没有视野数据时按空列表读取（每个视野统计为空，页面/CSV 显示无视野）。

const geo = require('./geometry');

// 细胞标识（与比较模块一致：有 id 用 id，历史数据用序号兜底）
function cellKey(cell, index) {
  return (cell && typeof cell.id === 'string' && cell.id) ? cell.id : `#${index}`;
}

function cellName(cell, index) {
  return (cell && cell.name && String(cell.name).trim()) || `细胞 ${index + 1}`;
}

function round(v, n = 4) {
  const f = 10 ** n;
  let r = Math.round(v * f) / f;
  if (Object.is(r, -0)) r = 0;
  return r;
}

const PENDING = '待定标';

// 净面积为零（或非正、退化）的细胞不参与统计。
// 返回 {index, cell, key, name, centroid, areaPx}，不合格返回 null。
function eligibleCell(cell, index) {
  if (!cell || !Array.isArray(cell.outer)) return null;
  const rc = geo.regionCentroid(cell.outer, Array.isArray(cell.holes) ? cell.holes : []);
  if (!rc) return null; // 净面积为零/退化
  return {
    index,
    cell,
    key: cellKey(cell, index),
    name: cellName(cell, index),
    centroid: { x: rc.x, y: rc.y },
    areaPx: rc.areaPx
  };
}

// 单个视野的统计
function buildFieldStat(field, seq, cells, scale) {
  const holes = Array.isArray(field.holes) ? field.holes : [];
  const counted = [];
  const eligible = [];
  cells.forEach((cell, i) => {
    const e = eligibleCell(cell, i);
    if (!e) return;
    eligible.push(e);
    if (geo.pointInRegion(e.centroid, field.outer, holes)) counted.push(e);
  });

  const netAreaPx = geo.regionCentroid(field.outer, holes);
  const fieldAreaPx = netAreaPx ? netAreaPx.areaPx : 0;

  const stat = {
    key: (typeof field.id === 'string' && field.id) ? field.id : `#${seq}`,
    name: (field.name && String(field.name).trim()) || `视野 ${seq + 1}`,
    holes: holes.length,
    cellCount: counted.length,
    countedCellKeys: counted.map((c) => c.key)
  };

  if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
    const px2ToMm2 = scale * scale / 1e6; // 1 mm = 1000 μm
    const areaMm2 = fieldAreaPx * px2ToMm2;
    const countedAreaMm2 = counted.reduce((s, c) => s + c.areaPx * px2ToMm2, 0);
    stat.calibrated = true;
    stat.netAreaMm2 = round(areaMm2, 6);
    stat.densityPerMm2 = areaMm2 > 0 ? round(counted.length / areaMm2, 4) : null;
    stat.countedCellAreaMm2 = round(countedAreaMm2, 6);
    stat.netAreaText = String(stat.netAreaMm2);
    stat.densityText = stat.densityPerMm2 === null ? '' : String(stat.densityPerMm2);
    stat.countedCellAreaText = String(stat.countedCellAreaMm2);
  } else {
    stat.calibrated = false;
    stat.netAreaMm2 = null;
    stat.densityPerMm2 = null;
    stat.countedCellAreaMm2 = null;
    stat.netAreaText = PENDING;
    stat.densityText = PENDING;
    stat.countedCellAreaText = PENDING;
  }
  return stat;
}

// 整份草稿/报告的视野统计。fields 为 null/undefined（旧报告）时按空列表处理。
function buildFieldStats(fields, cells, calib) {
  const list = Array.isArray(fields) ? fields : [];
  const scale = calib && typeof calib.scale === 'number' ? calib.scale : null;
  return {
    calibrated: scale !== null,
    fields: list.map((f, i) => buildFieldStat(f, i, cells || [], scale))
  };
}

module.exports = {
  PENDING,
  cellKey,
  cellName,
  round,
  eligibleCell,
  buildFieldStat,
  buildFieldStats
};
