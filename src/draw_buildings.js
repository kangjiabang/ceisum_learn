import { parseWKTCoordinates, bufferPolygon } from "./parse_buildings.js";

let lastBuildingId = null;
let highlightedBuildingEntity = null;

/**
 * 计算多边形中心点（使用几何重心算法）
 */
function computeCentroid(coords) {
  let area = 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const cross = x0 * y1 - x1 * y0;

    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  area *= 0.5;
  const factor = 1 / (6 * area);

  return [x * factor, y * factor];
}

/**
 * 高亮建筑，并返回中心点（Cartesian3）
 */
export function updateHighlightedBuilding(nearest, viewer) {
  const currentId = nearest.polygon.properties.id;
  if (currentId === lastBuildingId) {
    return null; // 没更新，不返回中心点
  }
  lastBuildingId = currentId;

  // 解析 WKT → 坐标数组（[lon, lat] 列表）
  const coordinates = parseWKTCoordinates(nearest.polygon.properties.wkt);
  if (!coordinates) return null;

  // 膨胀 polygon（绘制用）
  const coords = bufferPolygon(coordinates, 2);

  // 计算建筑物的中心点（lon, lat）
  const [centerLon, centerLat] = computeCentroid(coordinates);

  // 转换为 Cesium Cartesian3
  const centerPos = Cesium.Cartesian3.fromDegrees(
    centerLon,
    centerLat,
    nearest.polygon.properties.height / 2 // 设置成建筑中心高度
  );

  // 初始化 or 更新 entity
  if (!highlightedBuildingEntity) {
    highlightedBuildingEntity = viewer.entities.add({
      name: `高亮建筑`,
      position: centerPos, // ⭐ 添加建筑中心点
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
        extrudedHeight: nearest.polygon.properties.height,
        height: 10,
        material: Cesium.Color.RED.withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 5,
        classificationType: Cesium.ClassificationType.BOTH,
      },
      label: {
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        backgroundColor: Cesium.Color.RED,
        backgroundOpacity: 0.7,
        showBackground: true,
        pixelOffset: new Cesium.Cartesian2(0, -50),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scale: 0.8,
        scaleByDistance: new Cesium.NearFarScalar(100.0, 1.0, 3000.0, 0.3),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0.0,
          5000.0
        ),
      },
    });
  }

  // 更新属性
  highlightedBuildingEntity.name = `高亮建筑 ID: ${nearest.polygon.properties.id}`;
  highlightedBuildingEntity.position = centerPos; // ⭐ 中心点更新
  highlightedBuildingEntity.polygon.hierarchy =
    Cesium.Cartesian3.fromDegreesArray(coords);
  highlightedBuildingEntity.polygon.extrudedHeight =
    nearest.polygon.properties.height;
  highlightedBuildingEntity.label.text = `⚠️ 障碍物
实际距离: ${nearest.actualDistance.toFixed(1)}m
高度: ${nearest.polygon.properties.height}m`;
  highlightedBuildingEntity.show = true;

  // ⭐ 返回中心点 Cartesian3
  return centerPos;
}

export function clearHighlightedBuilding() {
  if (highlightedBuildingEntity) {
    highlightedBuildingEntity.show = false;
  }
}
