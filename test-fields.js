'use strict';

// 取样视野 / 细胞密度统计自测（node test-fields.js）
const assert = require('assert');
const geo = require('./server/geometry');
const fields = require('./server/fields');
const { buildFieldsCsv } = require('./server/exporter');

const W = 200, H = 200;
// 定标：1 px = 1 μm（scale=1），因此 1 px² = 1e-6 mm²
const calib = { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, distanceUm: 100, scale: 1 };

// 几何辅助：以 (cx,cy) 为中心、w×h 的轴对齐矩形
function rect(cx, cy, w, h) {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 }
  ];
}

// 1. 净区域质心：外环挖掉偏置孔洞后，质心向反方向偏移
{
  const outer = rect(50, 50, 80, 80);          // 面积 6400，质心 (50,50)
  const hole = rect(65, 50, 30, 30);           // 面积 900，质心 (65,50)
  const rc = geo.regionCentroid(outer, [hole]);
  assert.ok(rc);
  assert.ok(Math.abs(rc.areaPx - 5500) < 1e-9, rc.areaPx);
  // 从右侧挖走质量，质心应左移
  assert.ok(rc.x < 50, `质心应左移，实际 x=${rc.x}`);
  assert.ok(Math.abs(rc.y - 50) < 1e-9);
  // 与公式 (50*6400 - 65*900)/5500 对照
  assert.ok(Math.abs(rc.x - ((50 * 6400 - 65 * 900) / 5500)) < 1e-9);
  console.log('ok 1 净区域质心按孔洞面积加权扣减');
}

// 2. 质心归属：严格在内计入；边界 / 孔洞内不计入；孔洞边界不计入
{
  const outer = rect(50, 50, 80, 80);
  const hole = rect(65, 50, 30, 30);
  assert.strictEqual(geo.pointInRegion({ x: 20, y: 50 }, outer, [hole]), true);   // 净区域内
  assert.strictEqual(geo.pointInRegion({ x: 10, y: 50 }, outer, [hole]), false);  // 外边界
  assert.strictEqual(geo.pointInRegion({ x: 65, y: 50 }, outer, [hole]), false);  // 孔洞内部
  assert.strictEqual(geo.pointInRegion({ x: 80, y: 50 }, outer, [hole]), false);  // 孔洞边界
  assert.strictEqual(geo.pointInRegion({ x: 200, y: 200 }, outer, [hole]), false); // 区域外
  console.log('ok 2 质心严格落入净区域才计入（边界/孔洞均不计入）');
}

// 3. 视野校验：越界 / 自交 / 孔洞越界 / 净面积非正拒绝整批
{
  assert.throws(() => geo.validateField({ _seq: 1, outer: rect(100, 100, 0, 0) }, W, H)); // 退化（重复点）
  const bow = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 90 }];
  assert.throws(() => geo.validateField({ _seq: 1, outer: bow }, W, H), /自交/);
  const oob = rect(190, 100, 40, 40);
  assert.throws(() => geo.validateField({ _seq: 1, outer: oob }, W, H), /越出图片/);
  const outer = rect(50, 50, 80, 80);
  const touchOuter = [
    { x: 10, y: 40 }, { x: 30, y: 40 }, { x: 30, y: 60 }, { x: 10, y: 60 }
  ];
  assert.throws(() => geo.validateField({ _seq: 1, outer, holes: [touchOuter] }, W, H), /严格位于/);
  // 孔洞彼此接触
  const h1 = rect(25, 50, 20, 20);
  const h2 = rect(45, 50, 20, 20); // h1 右边界 x=35，h2 左边界 x=35，共边接触
  assert.throws(() => geo.validateField({ _seq: 1, outer, holes: [h1, h2] }, W, H), /孔洞 1 与孔洞 2/);
  console.log('ok 3 视野越界/自交/孔洞非法/孔洞接触被拒绝');
}

// 4. 统计：细胞以净区域质心归属、重叠视野重复计数、零净面积细胞不计入
{
  // 两个细胞：A 质心落在 (40,40)；B 挖空使净质心偏移后落在视野 1 内
  const cellA = { id: 'A', name: 'A', outer: rect(40, 40, 20, 20), holes: [] }; // 质心 (40,40)
  // B：大矩形挖去偏心孔，把净质心推到左侧 (约 147.8)，仍在视野2内
  const cellB = { id: 'B', name: 'B', outer: rect(150, 60, 40, 40), holes: [rect(162, 60, 10, 10)] };
  const cells = [cellA, cellB];

  // 视野 1 覆盖左半，视野 2 覆盖右半并与视野 1 重叠；B 质心同时不在视野1
  const f1 = { id: 'f1', name: '视野一', outer: rect(40, 40, 60, 60), holes: [] };
  const f2 = { id: 'f2', name: '视野二', outer: rect(150, 60, 60, 60), holes: [] };
  const view = fields.buildFieldStats([f1, f2], cells, calib);
  assert.strictEqual(view.calibrated, true);
  assert.strictEqual(view.fields[0].cellCount, 1, JSON.stringify(view.fields[0]));
  assert.strictEqual(view.fields[1].cellCount, 1);
  assert.deepStrictEqual(view.fields[0].countedCellKeys, ['A']);
  assert.deepStrictEqual(view.fields[1].countedCellKeys, ['B']);
  // 净面积：视野 60×60=3600 px² → 0.0036 mm²；密度 1/0.0036 ≈ 277.7778
  assert.ok(Math.abs(view.fields[0].netAreaMm2 - 0.0036) < 1e-9, view.fields[0].netAreaMm2);
  assert.ok(Math.abs(view.fields[0].densityPerMm2 - 277.7778) < 1e-7, view.fields[0].densityPerMm2);
  // 计入细胞净面积：A = 400 px² = 0.0004 mm²
  assert.ok(Math.abs(view.fields[0].countedCellAreaMm2 - 0.0004) < 1e-9);
  console.log('ok 4 质心归属/密度/计入细胞净面积总和正确');

  // 重叠视野重复计数：再加一个大视野覆盖 A、B
  const fBig = { id: 'big', name: '大全景', outer: rect(100, 50, 190, 100), holes: [] };
  const v2 = fields.buildFieldStats([f1, f2, fBig], cells, calib);
  assert.strictEqual(v2.fields[2].cellCount, 2, '大视野内 A、B 各计一次（重叠可重复计数）');
  console.log('ok 5 重叠视野中同一细胞可被多个视野重复计数');

  // 净面积退化细胞（外环面积 = 孔洞面积）不进入任何视野
  const deg = geo.regionCentroid(rect(0, 0, 10, 10), [rect(0, 0, 10, 10)]);
  assert.strictEqual(deg, null);
  assert.strictEqual(fields.eligibleCell({ id: 'z', outer: rect(0, 0, 10, 10), holes: [rect(0, 0, 10, 10)] }, 0), null);
  console.log('ok 6 净面积为零的细胞不计入统计');
}

// 7. 未定标：保留视野与细胞数，面积/密度显示「待定标」
{
  const cells = [{ id: 'A', name: 'A', outer: rect(40, 40, 20, 20), holes: [] }];
  const f = { id: 'f', name: 'S1', outer: rect(40, 40, 60, 60), holes: [] };
  const view = fields.buildFieldStats([f], cells, null);
  assert.strictEqual(view.calibrated, false);
  const s = view.fields[0];
  assert.strictEqual(s.cellCount, 1); // 细胞数仍统计
  assert.strictEqual(s.netAreaMm2, null);
  assert.strictEqual(s.densityPerMm2, null);
  assert.strictEqual(s.countedCellAreaMm2, null);
  assert.strictEqual(s.netAreaText, '待定标');
  assert.strictEqual(s.densityText, '待定标');
  assert.strictEqual(s.countedCellAreaText, '待定标');
  console.log('ok 7 未定标时保留视野与细胞数，面积/密度/计入面积总和为「待定标」');
}

// 8. 孔洞把质心位置占住的细胞：质心落入某视野孔洞时该视野不计
{
  // 细胞净质心 (30,50)；视野孔洞正好覆盖该点
  const cell = { id: 'C', name: 'C', outer: rect(30, 50, 40, 40), holes: [rect(45, 50, 10, 10)] };
  const rc = geo.regionCentroid(cell.outer, cell.holes);
  const f = { id: 'f', name: 'F', outer: rect(30, 50, 80, 80), holes: [rect(rc.x, rc.y, 20, 20)] };
  const view = fields.buildFieldStats([f], [cell], calib);
  assert.strictEqual(view.fields[0].cellCount, 0, '细胞质心落在视野孔洞内，不计入');
  console.log('ok 8 细胞质心落在视野孔洞内不计入');
}

// 9. 旧报告无视野（null / 空数组）按空列表读取
{
  const v1 = fields.buildFieldStats(null, [], calib);
  const v2 = fields.buildFieldStats(undefined, [], null);
  assert.deepStrictEqual(v1.fields, []);
  assert.deepStrictEqual(v2.fields, []);
  console.log('ok 9 旧报告缺少视野按空列表读取');
}

// 10. 视野统计 CSV 与冻结结果一致：列、待定标、空列表、BOM
{
  const reportMeta = { id: 'r1', title: '报告T', draftVersion: 7, createdAt: '2026-10-01 00:00:00', filename: 'x.png' };
  // 有视野（已定标）
  const cells = [{ id: 'A', name: 'A', outer: rect(40, 40, 20, 20), holes: [] }];
  const f = { id: 'f', name: 'S1', outer: rect(40, 40, 60, 60), holes: [] };
  const view = fields.buildFieldStats([f], cells, calib);
  const csv = buildFieldsCsv(view, reportMeta);
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  for (const h of ['视野名称', '净面积(mm²)', '细胞数', '细胞密度(个/mm²)', '计入细胞净面积总和(mm²)']) {
    assert.ok(csv.includes(h), `缺少列：${h}`);
  }
  assert.ok(csv.includes('S1') && csv.includes('0.0036'));
  assert.ok(csv.includes('r1') && csv.includes('v7'));

  // 未定标：待定标
  const pending = fields.buildFieldStats([f], cells, null);
  const csvPending = buildFieldsCsv(pending, reportMeta);
  assert.strictEqual((csvPending.match(/待定标/g) || []).length, 3, '面积/密度/计入面积总和三处待定标');

  // 空视野：提示行
  const csvEmpty = buildFieldsCsv(fields.buildFieldStats([], cells, calib), reportMeta);
  assert.ok(csvEmpty.includes('无取样视野'));
  console.log('ok 10 视野统计 CSV 列/数值/待定标/空列表/BOM 与冻结结果一致');
}

// 11. 视野默认名（未命名时按序号）
{
  const s = fields.buildFieldStat({ outer: rect(0, 0, 10, 10), holes: [] }, 2, [], calib);
  assert.strictEqual(s.name, '视野 3');
  const named = fields.buildFieldStat({ name: '  表皮层  ', outer: rect(0, 0, 10, 10), holes: [] }, 0, [], calib);
  assert.strictEqual(named.name, '表皮层');
  console.log('ok 11 视野命名/默认序号');
}

console.log('\n全部视野统计自测通过 ✔');
