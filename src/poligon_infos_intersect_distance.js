// src/polygon_infos_intersect_distance.js

import * as turf from '@turf/turf';
import parseBuildingsFile from './parse_buildings.js';

// 全局缓存空间索引和建筑物数据
let tree = null;
let polygons = [];

// 初始化空间索引（只执行一次）
async function initSpatialIndex() {
    if (tree) return; // 已初始化

    const { default: RBush } = await import('rbush');

    // 解析建筑物数据
    polygons = await parseBuildingsFile('./src/buildings_output.txt');
    console.log(`加载了 ${polygons.length} 个建筑物`);

    // 构建空间索引
    const indexedItems = polygons.map((polygon, index) => {
        const bbox = turf.bbox(polygon);
        return {
            minX: bbox[0],
            minY: bbox[1],
            maxX: bbox[2],
            maxY: bbox[3],
            polygon: polygon,
            index: index
        };
    });

    tree = new RBush();
    tree.load(indexedItems);
}

//计算点到多边形的距离（简化版）
// function getDistanceToPoint(point, polygon) {
//     try {
//         const centroid = turf.centroid(polygon);
//         return turf.distance(point, centroid, { units: 'kilometers' });
//     } catch (error) {
//         try {
//             const bbox = turf.bbox(polygon);
//             const bboxCenter = turf.point([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]);
//             return turf.distance(point, bboxCenter, { units: 'kilometers' });
//         } catch (error2) {
//             return Infinity;
//         }
//     }
// }

function getDistanceToPoint(point, polygon) {
    try {

        // 如果你希望用“千米”为单位
        const distance = turf.pointToPolygonDistance(point, polygon, {
            units: 'kilometers',
        });
        //console.log(`点到多边形的距离：${distance} 千米`);
        return distance;

    } catch (error) {
        console.error('点到多边形的距离计算失败：', error.message);
        return Infinity;
    }
}

// ✅ 核心导出函数：查询指定距离内的建筑物
export async function getBuildingsWithinDistance(point, distanceInMeters) {
    // 确保空间索引已初始化
    await initSpatialIndex();

    const distanceInKm = distanceInMeters / 1000;
    const [x, y] = point.geometry.coordinates;

    // 扩大搜索范围
    const searchRadius = Math.max(distanceInKm * 3, 0.01); // 至少 10 米
    const searchBounds = {
        minX: x - searchRadius,
        minY: y - searchRadius,
        maxX: x + searchRadius,
        maxY: y + searchRadius
    };

    // 使用 RTree 快速筛选候选
    const candidates = tree.search(searchBounds);
    console.log(`RTree 筛选出 ${candidates.length} 个候选建筑物`);

    // 过滤出真实距离在范围内的
    const result = candidates
        .map(item => {
            const distance = getDistanceToPoint(point, item.polygon);
            return {
                polygon: item.polygon,
                index: item.index,
                distance: distance,
                distanceInMeters: distance * 1000
            };
        })
        .filter(item => item.distance <= distanceInKm && item.distance !== Infinity)
        .sort((a, b) => a.distance - b.distance);

    return result;
}

export async function getNearstBuildingsWithinDistance(point, distanceInMeters, droneHeight) {
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
        console.log(`${i + 1}. ID: ${item.polygon.properties.id}, 距离: ${item.distanceInMeters.toFixed(2)}米`);
    });
}