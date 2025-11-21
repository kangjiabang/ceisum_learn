import { parseWKTCoordinates, bufferPolygon } from "/src/parse_buildings.js";

let lastBuildingId = null;
let highlightedBuildingEntity = null;
// 添加一个变量来存储当前高亮实体的中心点坐标
let currentHighlightedCenter = null;

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

export function updateHighlightedBuilding(nearest, viewer, dronePosition) {
  const currentId = nearest.polygon.properties.id;
  if (currentId === lastBuildingId) {
    return; // ✅ 相同建筑，不更新，避免多余开销
  }
  lastBuildingId = currentId;

  const coordinates = parseWKTCoordinates(nearest.polygon.properties.wkt);
  if (!coordinates) {
    console.error("Failed to parse WKT coordinates for building:", currentId);
    return;
  }

  // 1. 计算原始坐标的中心点（经纬度）
  const centerLonLat = calculateCentroid(coordinates);
  if (!centerLonLat) {
    console.error("Failed to calculate centroid for building:", currentId);
    return;
  }

  // 2. 获取建筑物高度，用于中心点的高度
  const buildingHeight = nearest.polygon.properties.height; // 假设这是建筑物的高度

  const droneHeight = dronePosition
    ? Cesium.Cartographic.fromCartesian(dronePosition).height
    : 0;
  let centerHeight;
  if (droneHeight > buildingHeight) {
    centerHeight = buildingHeight;
  } else {
    centerHeight = droneHeight;
  }

  // 3. 将中心点经纬度和高度转换为笛卡尔坐标
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

  const centerTopCartesian = convertToCartesianWithHeight(
    centerLonLat,
    buildingHeight
  );

  // 4. 存储当前中心点坐标（包含高度）
  currentHighlightedCenter = centerCartesian;

  // 5. 获取缓冲后的坐标用于绘制多边形
  const coords = bufferPolygon(coordinates, 2); // 假设 bufferPolygon 返回 [lon, lat, lon, lat, ...] 格式
  if (!coords) {
    console.error(
      "Failed to buffer polygon coordinates for building:",
      currentId
    );
    return;
  }

  if (!highlightedBuildingEntity) {
    // 第一次创建
    highlightedBuildingEntity = viewer.entities.add({
      name: `高亮建筑 ID: ${currentId}`,
      position: centerTopCartesian, // 设置实体位置为中心点
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
        extrudedHeight: buildingHeight,
        height: 10, // 地面高度，通常为0或10等小值
        material: Cesium.Color.RED.withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 5,
        classificationType: Cesium.ClassificationType.BOTH,
      },
      label: {
        // text: `⚠️ 障碍物\n实际距离: ${nearest.actualDistance.toFixed(
        //   1
        // )}m\n高度: ${buildingHeight}m`,
        text: `⚠️ 障碍物高度: ${buildingHeight}m`,
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
  } else {
    // 复用已有实体，只更新属性
    highlightedBuildingEntity.position = centerCartesian; // 更新实体位置为中心点
    highlightedBuildingEntity.name = `高亮建筑 ID: ${currentId}`;
    highlightedBuildingEntity.polygon.hierarchy =
      Cesium.Cartesian3.fromDegreesArray(coords);
    highlightedBuildingEntity.polygon.extrudedHeight = buildingHeight;
    highlightedBuildingEntity.label.text = `⚠️ 障碍物高度: ${buildingHeight}m`;
    highlightedBuildingEntity.show = true;
  }

  // 6. 输出中心点坐标（可选，用于调试）
  console.log(
    `Highlighted building ${currentId} center (Cartesian):`,
    centerCartesian
  );
  console.log(
    `Center coordinates (Lon, Lat, Height): ${centerLonLat[0]}, ${centerLonLat[1]}, ${centerHeight}`
  );

  return centerCartesian;
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
