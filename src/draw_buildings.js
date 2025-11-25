import { parseWKTCoordinates, bufferPolygon } from "/src/parse_buildings.js";

// 用于管理单个高亮的实体和ID (供 updateHighlightedBuilding 使用)
let lastBuildingId = null;
let highlightedBuildingEntity = null;
let currentHighlightedCenter = null;

// 用于管理多个高亮的实体列表 (供 updateHighlightedMultipleBuildings 使用)
let highlightedBuildingEntities = [];

// 计算多边形的几何中心（质心）
function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  let totalX = 0;
  let totalY = 0;
  let totalZ = 0;
  let count = 0;

  for (let i = 0; i < coordinates.length; i++) {
    // 假设 coordinates 是 [lon1, lat1, lon2, lat2, ...] 格式，且可能包含高度
    // 如果是 [lon, lat] 或 [lon, lat, height] 的数组，则直接使用
    if (Array.isArray(coordinates[i])) {
      // 如果是 [lon, lat] 或 [lon, lat, height] 数组
      totalX += coordinates[i][0];
      totalY += coordinates[i][1];
      // 如果存在高度值，也累加，但通常计算质心只用经纬度
      // totalZ += coordinates[i][2] || 0;
      count++;
    } else if (i + 1 < coordinates.length) {
      // 如果是 [lon, lat, lon, lat, ...] 格式
      totalX += coordinates[i]; // longitude
      totalY += coordinates[i + 1]; // latitude
      i++; // 跳过下一个（纬度）
      count++;
    }
  }

  if (count === 0) {
    return null;
  }

  const avgX = totalX / count;
  const avgY = totalY / count;
  // const avgZ = totalZ / count; // 如果需要平均高度

  // 返回 [longitude, latitude] 或 [longitude, latitude, averageHeight]
  // 这里返回经纬度，高度需要单独获取或指定
  return [avgX, avgY];
}

// 将度数坐标转换为笛卡尔坐标，并可选地指定高度
function convertToCartesianWithHeight(centerLonLat, height) {
  if (!centerLonLat) {
    return null;
  }
  return Cesium.Cartesian3.fromDegrees(
    centerLonLat[0],
    centerLonLat[1],
    height
  );
}

export function clearHighlightedBuilding() {
  if (highlightedBuildingEntity) {
    highlightedBuildingEntity.show = false;
    // 也可以选择隐藏整个实体
    // highlightedBuildingEntity.show = false;
  }
  // 清除存储的中心点坐标
  currentHighlightedCenter = null;
}

// 可选：添加一个函数来获取当前高亮建筑的中心点坐标
export function getCurrentHighlightedCenter() {
  return currentHighlightedCenter;
}

/**
 * 清除所有当前的高亮实体，无论是单个还是多个。
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 */
function clearAllHighlights(viewer) {
  // 1. 清除单个高亮实体
  if (highlightedBuildingEntity) {
    viewer.entities.remove(highlightedBuildingEntity);
    highlightedBuildingEntity = null;
  }
  lastBuildingId = null;
  currentHighlightedCenter = null;

  // 2. 清除多个高亮实体列表
  for (const entity of highlightedBuildingEntities) {
    viewer.entities.remove(entity);
  }
  highlightedBuildingEntities = [];
}

/**
 * 高亮单个最近的建筑物，并返回其中心笛卡尔坐标。
 *
 * @param {Object} nearest - 包含单个建筑物信息 { polygon, actualDistance }。
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例。
 * @param {Cesium.Cartesian3} dronePosition - 无人机/中心点位的 Cartesian3 坐标。
 * @returns {Cesium.Cartesian3 | undefined} - 返回高亮建筑物的中心笛卡尔坐标，如果失败则返回 undefined。
 */
export function updateHighlightedBuilding(nearest, viewer, dronePosition) {
  const currentId = nearest.polygon.properties.id;

  // 1. 【修改点】如果 ID 相同，且没有多重高亮被激活，则不更新
  // 如果当前只有一个高亮实体且ID相同，且没有其他多重高亮实体，则直接返回
  if (
    currentId === lastBuildingId &&
    highlightedBuildingEntities.length === 0
  ) {
    return currentHighlightedCenter;
  }

  // 2. 【修改点】先清理所有旧的高亮
  clearAllHighlights(viewer);

  // 此时，设置新的 lastBuildingId
  lastBuildingId = currentId;

  const coordinates = parseWKTCoordinates(nearest.polygon.properties.wkt);
  if (!coordinates) {
    console.error("Failed to parse WKT coordinates for building:", currentId);
    return;
  }

  // 3. 计算原始坐标的中心点（经纬度）
  const centerLonLat = calculateCentroid(coordinates);
  if (!centerLonLat) {
    console.error("Failed to calculate centroid for building:", currentId);
    return;
  }

  // 4. 获取建筑物高度，用于中心点的高度
  const buildingHeight = nearest.polygon.properties.height;

  const droneHeight = dronePosition
    ? Cesium.Cartographic.fromCartesian(dronePosition).height
    : 0;
  let centerHeight;
  if (droneHeight > buildingHeight) {
    centerHeight = buildingHeight;
  } else {
    centerHeight = droneHeight;
  }

  // 5. 将中心点经纬度和高度转换为笛卡尔坐标 (用于连线起点/地面高度)
  const centerCartesian = convertToCartesianWithHeight(
    centerLonLat,
    centerHeight
  );
  if (!centerCartesian) {
    console.error(
      "Failed to convert center coordinates to Cartesian for building:",
      currentId
    );
    return;
  }

  // 6. 顶部中心点（用于 Polygon position）
  const centerTopCartesian = convertToCartesianWithHeight(
    centerLonLat,
    buildingHeight
  );

  // 7. 存储当前中心点坐标（包含高度）
  currentHighlightedCenter = centerCartesian;

  // 8. 获取缓冲后的坐标用于绘制多边形
  const coords = bufferPolygon(coordinates, 2);
  if (!coords) {
    console.error(
      "Failed to buffer polygon coordinates for building:",
      currentId
    );
    return;
  }

  // 9. 创建实体
  highlightedBuildingEntity = viewer.entities.add({
    name: `高亮建筑 ID: ${currentId}`,
    position: centerTopCartesian,
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
      extrudedHeight: buildingHeight,
      height: 10,
      material: Cesium.Color.RED.withAlpha(0.5),
      outline: true,
      outlineColor: Cesium.Color.YELLOW,
      outlineWidth: 5,
      classificationType: Cesium.ClassificationType.BOTH,
    },
    label: {
      // 标签显示实际距离
      text: `⚠️ 障碍物\n实际距离: ${nearest.actualDistance.toFixed(
        1
      )}m\n高度: ${buildingHeight}m`,
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

  return centerCartesian;
}

/**
 * 高亮多个最近的建筑物，并返回它们的中心笛卡尔坐标。
 *
 * @param {Array<Object>} nearestBuildings - 包含建筑物信息 (polygon, actualDistance) 的数组。
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例。
 * @param {Cesium.Cartesian3} dronePosition - 无人机/中心点位的 Cartesian3 坐标。
 * @param {Object} buildingColors - 颜色阈值配置。
 * @param {number} [buildingColors.redThreshold=50] - 红色阈值距离（米）。
 * @param {number} [buildingColors.orangeThreshold=120] - 橙色阈值距离（米）。
 * @returns {Array<Cesium.Cartesian3>} - 返回所有高亮建筑物的中心笛卡尔坐标数组。
 */
export function updateHighlightedMultipleBuildings(
  nearestBuildings,
  viewer,
  dronePosition,
  buildingColors = { redThreshold: 50, orangeThreshold: 120 } // 默认值
) {
  // 1. 清除上一次所有高亮（包括单个和多个）
  clearAllHighlights(viewer);

  const highlightedCenters = [];

  if (!nearestBuildings || nearestBuildings.length === 0) {
    return highlightedCenters;
  }

  const { redThreshold, orangeThreshold } = buildingColors;

  const droneHeight = dronePosition
    ? Cesium.Cartographic.fromCartesian(dronePosition).height
    : 0;

  for (const item of nearestBuildings) {
    const currentId = item.polygon.properties.id;
    const actualDistance = item.actualDistance; // 获取实际距离

    const coordinates = parseWKTCoordinates(item.polygon.properties.wkt);
    if (!coordinates) {
      console.error("Failed to parse WKT coordinates for building:", currentId);
      continue;
    }

    // --- 新增：根据距离确定颜色 ---
    let highlightColor;
    if (actualDistance < redThreshold) {
      highlightColor = Cesium.Color.RED;
    } else if (actualDistance < orangeThreshold) {
      highlightColor = Cesium.Color.ORANGE;
    } else {
      highlightColor = Cesium.Color.GREEN;
    }
    // ----------------------------

    // 1. 计算原始坐标的中心点（经纬度）
    const centerLonLat = calculateCentroid(coordinates);
    if (!centerLonLat) {
      console.error("Failed to calculate centroid for building:", currentId);
      continue;
    }

    // 2. 获取建筑物高度，用于中心点的高度
    const buildingHeight = item.polygon.properties.height;

    // 计算中心点的 Z 轴高度 (取无人机高度和建筑高度的较小值)
    let centerHeight;
    if (droneHeight > buildingHeight) {
      centerHeight = buildingHeight;
    } else {
      centerHeight = droneHeight;
    }

    // 3. 将中心点经纬度和高度转换为笛卡尔坐标 (用于连线起点/地面高度)
    const centerCartesian = convertToCartesianWithHeight(
      centerLonLat,
      centerHeight
    );

    // 4. 计算顶部中心点 (用于实体位置)
    const centerTopCartesian = convertToCartesianWithHeight(
      centerLonLat,
      buildingHeight
    );

    if (!centerCartesian) {
      console.error(
        "Failed to convert center coordinates to Cartesian for building:",
        currentId
      );
      continue;
    }

    // 5. 获取缓冲后的坐标用于绘制多边形
    const coords = bufferPolygon(coordinates, 2);
    if (!coords) {
      console.error(
        "Failed to buffer polygon coordinates for building:",
        currentId
      );
      continue;
    }

    // 6. 创建新的实体
    const newEntity = viewer.entities.add({
      name: `高亮建筑 ID: ${currentId}`,
      position: centerTopCartesian,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
        extrudedHeight: buildingHeight,
        height: 10,
        // --- 应用高亮颜色 ---
        material: highlightColor.withAlpha(0.5),
        outline: true,
        outlineColor: highlightColor,
        // --------------------
        outlineWidth: 5,
        classificationType: Cesium.ClassificationType.BOTH,
      },
      label: {
        // 标签显示实际距离
        text: `⚠️ 障碍物\n实际距离: ${actualDistance.toFixed(
          1
        )}m\n高度: ${buildingHeight}m`,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        // --- 应用标签背景颜色 ---
        backgroundColor: highlightColor,
        // ------------------------
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

    // 7. 存储新创建的实体和中心点
    highlightedBuildingEntities.push(newEntity);
    highlightedCenters.push(centerCartesian);

    console.log(
      `Highlighted building ${currentId} center (Cartesian):`,
      centerCartesian
    );
  }

  return highlightedCenters;
}
