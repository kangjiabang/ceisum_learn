// src/polygon_infos_intersect_distance.js

import * as turf from "@turf/turf";
import parseBuildingsFile from "./parse_buildings.js";
import RBush from "rbush";
// 全局缓存空间索引和建筑物数据
let tree = null;
let polygons = [];

// 初始化空间索引（只执行一次）
/**
 * 初始化空间索引（只执行一次）
 * 使用 RBush R-tree 数据结构构建空间索引以提高查询性能
 */
async function initSpatialIndex() {
  if (tree) return; // 已初始化

  // 解析建筑物数据
  try {
    polygons = await parseBuildingsFile("/src/buildings_output.txt");
    console.log(`加载了 ${polygons.length} 个建筑物`);
  } catch (error) {
    console.warn(
      "⚠️ 建筑物数据文件不存在或加载失败，使用空数据集:",
      error.message
    );
    polygons = [];
  }

  // 构建空间索引
  const indexedItems = polygons.map((polygon, index) => {
    const bbox = turf.bbox(polygon);
    return {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      polygon: polygon,
      index: index,
    };
  });

  tree = new RBush();
  tree.load(indexedItems);
}

function getDistanceToPoint(point, polygon) {
  try {
    // 如果你希望用“千米”为单位
    const distance = turf.pointToPolygonDistance(point, polygon, {
      units: "kilometers",
    });
    //console.log(`点到多边形的距离：${distance} 千米`);
    return distance;
  } catch (error) {
    console.error("点到多边形的距离计算失败：", error.message);
    return Infinity;
  }
}

// ✅ 核心导出函数：查询指定距离内的建筑物
export async function getBuildingsWithinDistance(point, distanceInMeters) {
  // 确保空间索引已初始化
  await initSpatialIndex();

  const distanceInKm = distanceInMeters / 1000;
  const [x, y] = point.geometry.coordinates;

  // 将距离（千米）转换为经纬度差值
  // 1度纬度大约等于111千米，经度需要根据纬度进行调整
  const latDegreePerKm = 1 / 111;
  const lngDegreePerKm = 1 / (111 * Math.cos((y * Math.PI) / 180));

  // 扩大搜索范围（转换为度）
  const searchRadiusLat = distanceInKm * 3 * latDegreePerKm;
  const searchRadiusLng = distanceInKm * 3 * lngDegreePerKm;
  const minSearchRadius = 0.0001; // 最小搜索半径约为11米

  const searchBounds = {
    minX: x - Math.max(searchRadiusLng, minSearchRadius),
    minY: y - Math.max(searchRadiusLat, minSearchRadius),
    maxX: x + Math.max(searchRadiusLng, minSearchRadius),
    maxY: y + Math.max(searchRadiusLat, minSearchRadius),
  };

  // 使用 RTree 快速筛选候选
  const candidates = tree.search(searchBounds);
  console.log(`RTree 筛选出 ${candidates.length} 个候选建筑物`);

  // 过滤出真实距离在范围内的
  const result = candidates
    .map((item) => {
      const distance = getDistanceToPoint(point, item.polygon);
      return {
        polygon: item.polygon,
        index: item.index,
        distance: distance,
        distanceInMeters: distance * 1000,
      };
    })
    .filter(
      (item) => item.distance <= distanceInKm && item.distance !== Infinity
    )
    .sort((a, b) => a.distance - b.distance);

  return result;
}

/**
 * 在 Cesium 场景中查找指定点位附近，距离最近的 N 个建筑物信息。
 *
 * @param {Cesium.Cartesian3} pointCesium - 中心点位的 Cartesian3 坐标。
 * @param {number} distanceInMeters - 初始检测半径 (米)，用于调用 getBuildingsWithinDistance。
 * @param {number} count - 需要返回的最近建筑物的数量。
 * @returns {Promise<Array<Object> | undefined>} - 返回包含 'count' 个最近建筑物信息的数组，
 * 每个对象包含 { polygon, distanceInMeters, actualDistance }，
 * 如果没有找到任何建筑物则返回 undefined。
 */
export async function getNearstMultipleBuildingsWithinDistance(
  pointCesium,
  distanceInMeters,
  count // 新增参数
) {
  const lonLatHeight = Cesium.Cartographic.fromCartesian(pointCesium);
  const lon = Cesium.Math.toDegrees(lonLatHeight.longitude);
  const lat = Cesium.Math.toDegrees(lonLatHeight.latitude);
  const droneHeight = lonLatHeight.height;

  const point = turf.point([lon, lat]);

  // 1. 获取检测半径内的所有建筑物
  const allBuildings = await getBuildingsWithinDistance(
    point,
    distanceInMeters
  );

  if (allBuildings.length === 0) {
    // 兼容你的旧函数返回 undefined 的逻辑，这里返回 undefined
    return undefined;
  }

  // 2. 计算每个建筑物的实际距离并存储
  const buildingsWithDistance = allBuildings.map((item) => {
    const buildingHeight = item.polygon.properties.height;
    const horizontalDistance = item.distanceInMeters;

    let actualDistance;

    // 计算实际距离的逻辑保持不变
    if (horizontalDistance <= 0) {
      // 无人机在建筑投影范围内
      if (droneHeight > buildingHeight) {
        actualDistance = droneHeight - buildingHeight; // 高于建筑，垂直差
      } else {
        actualDistance = 0; // 在建筑物里面或低于建筑顶
      }
    } else {
      // 无人机不在建筑投影范围
      if (droneHeight <= buildingHeight) {
        actualDistance = horizontalDistance; // 水平距离
      } else {
        actualDistance = Math.sqrt(
          Math.pow(droneHeight - buildingHeight, 2) +
            Math.pow(horizontalDistance, 2)
        );
      }
    }

    // 返回带有实际距离的完整对象
    return { ...item, actualDistance };
  });

  // 3. 按实际距离升序排序
  buildingsWithDistance.sort((a, b) => a.actualDistance - b.actualDistance);

  // 4. 返回前 count 个建筑物
  // 使用 slice(0, count) 确保只返回指定数量的元素。
  // 如果建筑物总数小于 count，则返回所有建筑物。
  return buildingsWithDistance.slice(0, count);
}

export async function getNearstBuildingsWithinDistanceWithPoint(
  pointCesium,
  distanceInMeters
) {
  const lonLatHeight = Cesium.Cartographic.fromCartesian(pointCesium);
  const lon = Cesium.Math.toDegrees(lonLatHeight.longitude);
  const lat = Cesium.Math.toDegrees(lonLatHeight.latitude);
  const droneHeight = lonLatHeight.height;

  const point = turf.point([lon, lat]);
  const result = await getBuildingsWithinDistance(point, distanceInMeters);

  if (result.length === 0) {
    return;
  }
  let nearest = null;
  let minActualDistance = Infinity;

  for (const item of result) {
    const buildingHeight = item.polygon.properties.height;
    const horizontalDistance = item.distanceInMeters;

    // 计算实际距离
    let actualDistance;
    if (horizontalDistance <= 0) {
      // 无人机在建筑投影范围内
      if (droneHeight > buildingHeight) {
        actualDistance = droneHeight - buildingHeight; // 高于建筑，垂直差
      } else {
        actualDistance = 0; // 在建筑物里面或低于建筑顶
      }
    } else {
      // 无人机不在建筑投影范围
      if (droneHeight <= buildingHeight) {
        actualDistance = horizontalDistance; // 水平距离
      } else {
        actualDistance = Math.sqrt(
          Math.pow(droneHeight - buildingHeight, 2) +
            Math.pow(horizontalDistance, 2)
        );
      }
    }

    // 记录最小距离
    if (actualDistance < minActualDistance) {
      minActualDistance = actualDistance;
      nearest = { ...item, actualDistance };
    }
  }
  return nearest;
}

/**
 * 查找指定距离内最近的建筑物（考虑3D距离）
 * @param {Array<number>} coordinates - 坐标数组 [longitude, latitude, height]，表示无人机位置
 * @param {number} distanceInMeters - 查询半径（米）
 * @returns {Promise<Object|undefined>} 返回最近的建筑物对象，包含实际3D距离
 */
export async function getNearstBuildingsWithinDistance(
  coordinates,
  distanceInMeters
) {
  // 从坐标数组中提取经纬度和高度
  const [longitude, latitude, height] = coordinates;
  const droneHeight = height;

  // 创建 GeoJSON Feature 对象用于查询
  const point = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    properties: {
      height: droneHeight,
    },
  };

  const result = await getBuildingsWithinDistance(point, distanceInMeters);

  if (result.length === 0) {
    return;
  }
  let nearest = null;
  let minActualDistance = Infinity;

  for (const item of result) {
    const buildingHeight = item.polygon.properties.height;
    const horizontalDistance = item.distanceInMeters;

    // 计算实际距离
    let actualDistance;
    if (horizontalDistance <= 0) {
      // 无人机在建筑投影范围内
      if (droneHeight > buildingHeight) {
        actualDistance = droneHeight - buildingHeight; // 高于建筑，垂直差
      } else {
        actualDistance = 0; // 在建筑物里面或低于建筑顶
      }
    } else {
      // 无人机不在建筑投影范围
      if (droneHeight <= buildingHeight) {
        actualDistance = horizontalDistance; // 水平距离
      } else {
        actualDistance = Math.sqrt(
          Math.pow(droneHeight - buildingHeight, 2) +
            Math.pow(horizontalDistance, 2)
        );
      }
    }

    // 记录最小距离
    if (actualDistance < minActualDistance) {
      minActualDistance = actualDistance;
      nearest = { ...item, actualDistance };
    }
  }
  return nearest;
}

// 可选：测试函数
export async function testQuery() {
  const testPoint = turf.point([119.946044, 30.267472]);
  const result = await getBuildingsWithinDistance(testPoint, 100);
  console.log(`100米内找到 ${result.length} 个建筑物`);
  result.forEach((item, i) => {
    console.log(
      `${i + 1}. ID: ${
        item.polygon.properties.id
      }, 距离: ${item.distanceInMeters.toFixed(2)}米`
    );
  });
}
