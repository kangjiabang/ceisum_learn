// highlight_nearest_building.js

import { getNearstMultipleBuildingsWithinDistance } from "./poligon_infos_intersect_distance.js"; // 假设路径正确
import { updateHighlightedMultipleBuildings } from "./draw_buildings.js"; // 假设路径正确
import { calculateAndConnectNearestByPositions } from "./drone_distance_utils.js"; // 假设路径正确

/**
 * 在 Cesium 场景中高亮给定点位附近指定距离内的建筑物，并计算连接线。
 * * **注意: 现已调用 getNearstMultipleBuildingsWithinDistance 和 updateHighlightedMultipleBuildings，支持高亮多个建筑物。**
 * * @param {Object} options - 配置选项
 * @param {Array<number>} options.centerLla - 中心点位的 [经度, 纬度, 高度] 数组（用于连线计算和查找建筑物）
 * @param {number} options.detectionRadius - 检测半径 (米)
 * @param {number} options.count - 要连接/高亮的建筑物个数 (默认值 1)
 * @param {number} options.redThreshold - 连线距离红色阈值
 * @param {number} options.orangeThreshold - 连线距离橙色阈值
 * @param {string} options.prefixText - 连线标签前缀文本
 * @param {Cesium.Viewer} options.viewer - Cesium Viewer 实例
 * @returns {Promise<Array<Cesium.Entity>>} - 返回创建的连线实体数组
 */
export async function highlightNearestBuildingAndConnect(options) {
  const {
    centerLla,
    detectionRadius,
    count = 1, // 默认值，现在用于请求多个建筑物
    redThreshold,
    orangeThreshold,
    prefixText,
    viewer,
  } = options;

  // 1. 根据 centerLla 计算 Cartesian3 坐标
  // centerLla 结构: [经度, 纬度, 高度]
  const centerPoint = Cesium.Cartesian3.fromDegrees(
    centerLla[0], // 经度
    centerLla[1], // 纬度
    centerLla[2] // 高度
  );

  // 2. 调用 getNearstMultipleBuildingsWithinDistance 获取多个建筑物
  const nearestBuildings = await getNearstMultipleBuildingsWithinDistance(
    centerPoint,
    detectionRadius,
    count // 传入 count 参数
  );

  // 如果没有找到建筑物，则返回空数组
  if (!nearestBuildings || nearestBuildings.length === 0) {
    console.warn("在指定半径内未找到建筑物。");
    return [];
  }

  // 3. **【修改点】** 调用 updateHighlightedMultipleBuildings 高亮所有建筑物
  // 并获取所有高亮建筑的中心点 (Cartesian3) 数组
  const buildingCentersCartesian = updateHighlightedMultipleBuildings(
    nearestBuildings,
    viewer,
    centerPoint
  );

  // 如果没有有效的建筑物中心点，则返回
  if (!buildingCentersCartesian || buildingCentersCartesian.length === 0) {
    return [];
  }

  const buildingLlaPositions = [];

  // 4. 遍历中心点数组 (Cartesian3)，转换为 LLA 数组
  for (const centerCartesian of buildingCentersCartesian) {
    // 转换为 LLA 数组
    const buildingCarto = Cesium.Cartographic.fromCartesian(centerCartesian);
    const buildingLla = [
      Cesium.Math.toDegrees(buildingCarto.longitude),
      Cesium.Math.toDegrees(buildingCarto.latitude),
      buildingCarto.height, // 建筑物中心的高度
    ];
    // 收集 LLA 数组，用于批量连线
    buildingLlaPositions.push(buildingLla);
  }

  // 5. 使用 LLA 数组计算最近距离并连线
  const buildingsEntities = calculateAndConnectNearestByPositions({
    centerLla: centerLla, // 传入中心 LLA 数组
    otherLlaPositions: buildingLlaPositions, // 传入所有高亮建筑物的 LLA 数组
    count: buildingLlaPositions.length, // 连接所有高亮建筑物
    redThreshold: redThreshold,
    orangeThreshold: orangeThreshold,
    prefixText: prefixText,
    viewer: viewer,
  });

  return buildingsEntities;
}
