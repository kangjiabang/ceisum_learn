/**
 * 将经纬高坐标数组转换为 Cesium.Cartesian3 坐标数组
 * @param {Array<number[]>} llaPositions - 经纬高坐标数组，例如：[[lng1, lat1, alt1], [lng2, lat2, alt2], ...]
 * @returns {Array<Cesium.Cartesian3>} Cesium.Cartesian3 坐标数组
 */
function convertLlaToCartesian3(llaPositions) {
  return llaPositions.map((lla) =>
    Cesium.Cartesian3.fromDegrees(lla[0], lla[1], lla[2])
  );
}

/**
 * 计算最近的物体并创建连线和标签（基于经纬高坐标）
 * 给每个实体添加 type 标记，用于区分 line / label / drone
 * @param {Object} options
 * @param {number[]} options.centerLla - 中心物体位置 [longitude, latitude, altitude]
 * @param {Array<number[]>} options.otherLlaPositions - 其他物体位置数组 [[lng, lat, alt], ...]
 * @param {number} [options.count=3] - 要显示的最近物体数量
 * @param {number} [options.redThreshold=50] - 红色阈值距离（米）
 * @param {number} [options.orangeThreshold=120] - 橙色阈值距离（米）
 * @param {number} [options.lineWidth=3] - 线条宽度
 * @param {string} [options.font="16px sans-serif"] - 标签字体
 * @param {string} [options.prefixText=""] - 标签前缀文案
 * @param {Cesium.Viewer} [options.viewer] - Cesium Viewer 实例
 * @returns {Array} 包含连线和标签实体的数组
 */
export function calculateAndConnectNearestByPositions(options) {
  const {
    centerLla,
    otherLlaPositions,
    ...restOptions // 接收其他所有参数
  } = options;

  // 1. 将经纬高转换为 Cartesian3 坐标
  const centerPos = Cesium.Cartesian3.fromDegrees(
    centerLla[0],
    centerLla[1],
    centerLla[2]
  );
  const otherPositions = convertLlaToCartesian3(otherLlaPositions);

  // 2. 构造新的 options 对象，并调用原有的核心函数
  const newOptions = {
    centerPos,
    otherPositions,
    ...restOptions,
  };

  // 复用原有的核心逻辑
  return calculateAndConnectNearestByPositionsInternal(newOptions);
}

/**
 * 计算最近的物体并创建连线和标签（基于位置坐标）
 * 给每个实体添加 type 标记，用于区分 line / label / drone
 * @param {Object} options
 * @param {Cesium.Cartesian3} options.centerPos - 中心物体位置
 * @param {Array<Cesium.Cartesian3>} options.otherPositions - 其他物体位置数组
 * @param {number} [options.count=3] - 要显示的最近物体数量
 * @param {number} [options.redThreshold=50] - 红色阈值距离（米）
 * @param {number} [options.orangeThreshold=120] - 橙色阈值距离（米）
 * @param {number} [options.lineWidth=3] - 线条宽度
 * @param {string} [options.font="16px sans-serif"] - 标签字体
 * @param {string} [options.prefixText=""] - 标签前缀文案
 * @param {Cesium.Viewer} [options.viewer] - Cesium Viewer 实例
 * @returns {Array} 包含连线和标签实体的数组
 */
function calculateAndConnectNearestByPositionsInternal(options) {
  const {
    centerPos,
    otherPositions,
    count = 1,
    redThreshold = 50,
    orangeThreshold = 120,
    lineWidth = 3,
    font = "16px sans-serif",
    prefixText = "", // 新增前缀文案
    viewer,
  } = options;

  const distances = otherPositions.map((pos) => {
    const dist = Cesium.Cartesian3.distance(centerPos, pos);
    return { pos, dist };
  });

  const nearest = distances.sort((a, b) => a.dist - b.dist).slice(0, count);

  const createdEntities = [];

  nearest.forEach((item) => {
    const color =
      item.dist < redThreshold
        ? Cesium.Color.RED
        : item.dist < orangeThreshold
        ? Cesium.Color.ORANGE
        : Cesium.Color.GREEN;

    // 创建连线
    const line = viewer
      ? viewer.entities.add({
          polyline: {
            positions: [centerPos, item.pos],
            width: lineWidth,
            material: color,
          },
          type: "line",
        })
      : {
          polyline: {
            positions: [centerPos, item.pos],
            width: lineWidth,
            material: color,
          },
          type: "line",
        };
    createdEntities.push(line);

    // 标签位置：连线中点 + 偏移高度
    const midPoint = Cesium.Cartesian3.midpoint(
      centerPos,
      item.pos,
      new Cesium.Cartesian3()
    );
    const labelPos = new Cesium.Cartesian3(
      midPoint.x,
      midPoint.y,
      midPoint.z + 5
    );

    // 创建标签
    const labelText = `${prefixText}${item.dist.toFixed(1)} m`; // 拼接前缀文案
    const label = viewer
      ? viewer.entities.add({
          position: labelPos,
          label: {
            text: labelText,
            font: font,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          type: "label",
        })
      : {
          position: labelPos,
          label: {
            text: labelText,
            font: font,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          type: "label",
        };
    createdEntities.push(label);
  });

  return createdEntities;
}

/**
 * 生成随机偏移
 */
export function randomOffset(range = 0.001) {
  return (Math.random() - 0.5) * (range * 2);
}

/**
 * 清理实体数组
 * @param {Array} entities - 实体数组
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {string} [type] - 可选，仅清理指定类型（line / label / drone）
 */
export function clearEntities(entities, viewer, type) {
  if (!viewer) return;

  entities.forEach((entity) => {
    if (!type || entity.type === type) {
      viewer.entities.remove(entity);
    }
  });

  // 返回过滤后的数组（如果指定了 type）
  return type ? entities.filter((e) => e.type !== type) : [];
}
