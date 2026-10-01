'use strict';

// 前端几何工具：实时测量（与服务端公式一致）+ 保存前即时校验。
// 服务端会再次校验，所有非法输入均以服务端拒绝为准。

const GEOM_EPS = 1e-9;

function gCross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function gPointOnSegment(px, py, ax, ay, bx, by) {
  if (Math.abs(gCross(ax, ay, bx, by, px, py)) > GEOM_EPS) return false;
  return Math.min(ax, bx) - GEOM_EPS <= px && px <= Math.max(ax, bx) + GEOM_EPS &&
         Math.min(ay, by) - GEOM_EPS <= py && py <= Math.max(ay, by) + GEOM_EPS;
}

function gSegsTouch(a, b, c, d) {
  const o1 = gCross(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = gCross(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = gCross(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = gCross(c.x, c.y, d.x, d.y, b.x, b.y);
  if (Math.abs(o1) <= GEOM_EPS && gPointOnSegment(c.x, c.y, a.x, a.y, b.x, b.y)) return true;
  if (Math.abs(o2) <= GEOM_EPS && gPointOnSegment(d.x, d.y, a.x, a.y, b.x, b.y)) return true;
  if (Math.abs(o3) <= GEOM_EPS && gPointOnSegment(a.x, a.y, c.x, c.y, d.x, d.y)) return true;
  if (Math.abs(o4) <= GEOM_EPS && gPointOnSegment(b.x, b.y, c.x, c.y, d.x, d.y)) return true;
  return ((o1 > GEOM_EPS && o2 < -GEOM_EPS) || (o1 < -GEOM_EPS && o2 > GEOM_EPS)) &&
         ((o3 > GEOM_EPS && o4 < -GEOM_EPS) || (o3 < -GEOM_EPS && o4 > GEOM_EPS));
}

function gSelfIntersection(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = poly[j], d = poly[(j + 1) % n];
      const adjacent = (i + 1) % n === j || (j + 1) % n === i;
      if (adjacent) {
        const shared = (p) =>
          (Math.abs(p.x - a.x) <= GEOM_EPS && Math.abs(p.y - a.y) <= GEOM_EPS) ||
          (Math.abs(p.x - b.x) <= GEOM_EPS && Math.abs(p.y - b.y) <= GEOM_EPS);
        const contacts = [];
        if (gPointOnSegment(c.x, c.y, a.x, a.y, b.x, b.y)) contacts.push(c);
        if (gPointOnSegment(d.x, d.y, a.x, a.y, b.x, b.y)) contacts.push(d);
        if (contacts.length && !contacts.every(shared)) return [i + 1, j + 1];
        continue;
      }
      if (gSegsTouch(a, b, c, d)) return [i + 1, j + 1];
    }
  }
  return null;
}

function gPointStrictlyInside(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (gPointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y)) return false;
    const intersect = (a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function gEdges(poly) {
  const e = [];
  for (let i = 0; i < poly.length; i++) e.push([poly[i], poly[(i + 1) % poly.length]]);
  return e;
}

function gRingStrictlyInside(hole, outer) {
  if (!hole.every((p) => gPointStrictlyInside(p, outer))) return false;
  for (const [a, b] of gEdges(outer))
    for (const [c, d] of gEdges(hole))
      if (gSegsTouch(a, b, c, d)) return false;
  return true;
}

function gArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function gPerimeter(poly) {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

function gDupPoint(poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (Math.abs(a.x - b.x) <= GEOM_EPS && Math.abs(a.y - b.y) <= GEOM_EPS) return i + 1;
  }
  return null;
}

// 整份草稿即时校验，返回错误字符串或 null
function clientValidate(cells, width, height) {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const label = cell.name ? `细胞「${cell.name}」` : `第 ${i + 1} 个细胞`;
    const outer = cell.outer;
    if (outer.length < 3) return `${label}：外轮廓至少需要 3 个顶点`;
    const dup = gDupPoint(outer);
    if (dup) return `${label}：第 ${dup} 个点重复`;
    const oob = outer.findIndex((p) => p.x < 0 || p.y < 0 || p.x > width || p.y > height);
    if (oob >= 0) return `${label}：第 ${oob + 1} 个顶点越出图片范围`;
    const si = gSelfIntersection(outer);
    if (si) return `${label}：第 ${si[0]}、${si[1]} 条边相交/接触，轮廓不得自交`;

    for (let hi = 0; hi < cell.holes.length; hi++) {
      const hole = cell.holes[hi];
      const hl = `${label} 的孔洞 ${hi + 1}`;
      if (hole.length < 3) return `${hl}：至少需要 3 个顶点`;
      if (gDupPoint(hole)) return `${hl}：存在重复点`;
      if (hole.some((p) => p.x < 0 || p.y < 0 || p.x > width || p.y > height))
        return `${hl}：顶点越出图片范围`;
      const hsi = gSelfIntersection(hole);
      if (hsi) return `${hl}：自交`;
      if (!gRingStrictlyInside(hole, outer))
        return `${hl}：必须严格位于所属外轮廓内部，且不得接触外轮廓`;
    }
    for (let a = 0; a < cell.holes.length; a++) {
      for (let b = a + 1; b < cell.holes.length; b++) {
        let touch = gPointStrictlyInside(cell.holes[b][0], cell.holes[a]) ||
                    gPointStrictlyInside(cell.holes[a][0], cell.holes[b]);
        if (!touch) {
          for (const [p1, p2] of gEdges(cell.holes[a])) {
            for (const [q1, q2] of gEdges(cell.holes[b])) {
              if (gSegsTouch(p1, p2, q1, q2)) { touch = true; break; }
            }
            if (touch) break;
          }
        }
        if (touch) return `${label}：孔洞 ${a + 1} 与孔洞 ${b + 1} 相互接触或重叠`;
      }
    }
  }
  return null;
}

// 实时测量（scale = μm/px）；无定标时返回 null
function clientMeasure(cells, scale) {
  if (scale == null) return null;
  return cells.map((c) => {
    const areaPx = gArea(c.outer) - c.holes.reduce((s, h) => s + gArea(h), 0);
    const perPx = gPerimeter(c.outer) + c.holes.reduce((s, h) => s + gPerimeter(h), 0);
    return { areaUm2: areaPx * scale * scale, perimeterUm: perPx * scale };
  });
}

// 单个环的带符号面积 / 质心（标准多边形质心公式，绕向无关用绝对值处理）
function gRingCentroid(poly) {
  let twiceArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const f = a.x * b.y - b.x * a.y;
    twiceArea += f;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  if (Math.abs(twiceArea) <= GEOM_EPS * GEOM_EPS) return null;
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea), areaPx: Math.abs(twiceArea / 2) };
}

// 扣除孔洞后的净区域质心与净面积；净面积非正返回 null
function gRegionCentroid(outer, holes) {
  const oc = gRingCentroid(outer);
  if (!oc) return null;
  const outerArea = oc.areaPx;
  let netArea = outerArea, mx = oc.x * outerArea, my = oc.y * outerArea;
  for (const h of holes || []) {
    const hc = gRingCentroid(h);
    if (!hc) continue;
    netArea -= hc.areaPx;
    mx -= hc.x * hc.areaPx;
    my -= hc.y * hc.areaPx;
  }
  if (!(netArea > GEOM_EPS)) return null;
  return { x: mx / netArea, y: my / netArea, areaPx: netArea };
}

// 点是否压在环的任意一条边上
function gPointOnRing(p, poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (gPointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y)) return true;
  }
  return false;
}

// 点是否严格位于「外环 − 孔洞」净区域内（外环边界、孔洞边界、孔洞内部都不算）
function gPointInRegion(p, outer, holes) {
  if (!gPointStrictlyInside(p, outer)) return false;
  for (const h of holes || []) {
    if (gPointStrictlyInside(p, h)) return false;
    if (gPointOnRing(p, h)) return false;
  }
  return true;
}

// 视野（外环 + 孔洞）即时校验，与服务端 server/fields.validateField 规则一致
function clientValidateFields(fields, width, height) {
  const labelOf = (f, i) => f.name ? `视野「${f.name}」` : `第 ${i + 1} 个视野`;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const label = labelOf(f, i);
    const outer = f.outer;
    if (!outer || outer.length < 3) return `${label}：外环至少需要 3 个顶点`;
    const dup = gDupPoint(outer);
    if (dup) return `${label}：外环第 ${dup} 个点重复`;
    if (outer.some((p) => p.x < 0 || p.y < 0 || p.x > width || p.y > height))
      return `${label}：外环存在越出图片范围的顶点`;
    const si = gSelfIntersection(outer);
    if (si) return `${label}：第 ${si[0]}、${si[1]} 条边相交/接触，外环不得自交`;

    for (let hi = 0; hi < (f.holes || []).length; hi++) {
      const hole = f.holes[hi];
      const hl = `${label} 的孔洞 ${hi + 1}`;
      if (hole.length < 3) return `${hl}：至少需要 3 个顶点`;
      if (gDupPoint(hole)) return `${hl}：存在重复点`;
      if (hole.some((p) => p.x < 0 || p.y < 0 || p.x > width || p.y > height))
        return `${hl}：顶点越出图片范围`;
      if (gSelfIntersection(hole)) return `${hl}：孔洞自交`;
      if (!gRingStrictlyInside(hole, outer))
        return `${hl}：必须严格位于所属视野外环内部，且不得接触外环`;
    }
    for (let a = 0; a < f.holes.length; a++) {
      for (let b = a + 1; b < f.holes.length; b++) {
        let touch = gPointStrictlyInside(f.holes[b][0], f.holes[a]) ||
                    gPointStrictlyInside(f.holes[a][0], f.holes[b]);
        if (!touch) {
          for (const [p1, p2] of gEdges(f.holes[a])) {
            for (const [q1, q2] of gEdges(f.holes[b])) {
              if (gSegsTouch(p1, p2, q1, q2)) { touch = true; break; }
            }
            if (touch) break;
          }
        }
        if (touch) return `${label}：孔洞 ${a + 1} 与孔洞 ${b + 1} 相互接触或重叠`;
      }
    }
    const rc = gRegionCentroid(outer, f.holes || []);
    if (!rc) return `${label}：净面积非正，扣除孔洞后的面积必须大于 0`;
  }
  return null;
}

// 视野统计预览（与服务端 buildFieldStats 同一规则）；scale 为 μm/px，未定标为 null
function clientFieldStats(fields, cells, scale) {
  const eligible = [];
  (cells || []).forEach((cell) => {
    if (!cell || !Array.isArray(cell.outer)) return;
    const rc = gRegionCentroid(cell.outer, cell.holes || []);
    if (rc) eligible.push({ centroid: { x: rc.x, y: rc.y }, areaPx: rc.areaPx });
  });
  return (fields || []).map((f) => {
    const rc = gRegionCentroid(f.outer, f.holes || []);
    const areaPx = rc ? rc.areaPx : 0;
    const counted = eligible.filter((e) => gPointInRegion(e.centroid, f.outer, f.holes || []));
    const stat = {
      holes: (f.holes || []).length,
      cellCount: counted.length
    };
    if (scale != null && scale > 0) {
      const k = scale * scale / 1e6;
      const areaMm2 = areaPx * k;
      stat.calibrated = true;
      stat.netAreaMm2 = areaMm2;
      stat.densityPerMm2 = areaMm2 > 0 ? counted.length / areaMm2 : null;
      stat.countedCellAreaMm2 = counted.reduce((s, c) => s + c.areaPx * k, 0);
    } else {
      stat.calibrated = false;
    }
    return stat;
  });
}

window.ClientGeom = {
  clientValidate, clientMeasure,
  clientValidateFields, clientFieldStats,
  gArea, gPerimeter, gSelfIntersection, gPointStrictlyInside,
  gRingStrictlyInside, gEdges, gSegsTouch, gDupPoint,
  gRegionCentroid, gPointInRegion, gPointOnRing
};
