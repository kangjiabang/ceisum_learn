//import * as Cesium from "cesium";

// 使用全局版本
const Cesium = window.Cesium;
export function scanSurroundings(
  droneEntity,
  dronePosition,
  viewer,
  angleStep = 30,
  topN = 3
) {
  // 清理之前的射线实体
  if (viewer._rayEntities) {
    viewer._rayEntities.forEach((entity) => viewer.entities.remove(entity));
  }
  viewer._rayEntities = [];

  const hits = [];

  // 获取当地ENU坐标系
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(dronePosition);

  // 锥形向下扫描参数
  const verticalAngleStart = -10; // 起始垂直角度（向下10度）
  const verticalAngleEnd = -60; // 结束垂直角度（向下60度）
  const verticalStep = 15; // 垂直步长（度）

  // 1. 锥形向下扫描
  for (
    let horizontalAngle = 0;
    horizontalAngle < 360;
    horizontalAngle += angleStep
  ) {
    // 遍历垂直角度，形成锥形
    for (
      let verticalAngle = verticalAngleStart;
      verticalAngle >= verticalAngleEnd;
      verticalAngle -= verticalStep
    ) {
      const horizontalRad = Cesium.Math.toRadians(horizontalAngle);
      const verticalRad = Cesium.Math.toRadians(verticalAngle);

      // 计算锥形方向射线
      const direction = new Cesium.Cartesian3(
        Math.cos(horizontalRad) * Math.cos(Math.abs(verticalRad)), // x分量
        Math.sin(horizontalRad) * Math.cos(Math.abs(verticalRad)), // y分量
        Math.sin(verticalRad) // z分量 (负值表示向下)
      );

      // 转换到世界坐标系
      const worldDirection = Cesium.Matrix4.multiplyByPointAsVector(
        enu,
        direction,
        new Cesium.Cartesian3()
      );
      Cesium.Cartesian3.normalize(worldDirection, worldDirection);

      const ray = new Cesium.Ray(dronePosition, worldDirection);

      // 射线检测
      const result = viewer.scene.pickFromRay(ray);
      if (!result) {
        console.log(
          `❌ 锥形射线未穿过任何物体 at horizontal: ${horizontalAngle}, vertical: ${verticalAngle}`
        );
        continue;
      }

      if (result) {
        const hitPosition = result.position;
        const distance = Cesium.Cartesian3.distance(dronePosition, hitPosition);

        // 只添加距离在合理范围内的点
        if (distance <= 200) {
          hits.push({
            position: hitPosition,
            distance: distance,
            ray: ray,
            type: "cone", // 标记为锥形扫描
            horizontalAngle: horizontalAngle,
            verticalAngle: verticalAngle,
          });
        }
      }
    }
  }

  // 2. 水平方向扫描
  for (
    let horizontalAngle = 0;
    horizontalAngle < 360;
    horizontalAngle += angleStep
  ) {
    const horizontalRad = Cesium.Math.toRadians(horizontalAngle);

    // 水平方向射线（垂直角为0度）
    const direction = new Cesium.Cartesian3(
      Math.cos(horizontalRad), // x分量
      Math.sin(horizontalRad), // y分量
      0 // z分量 (水平方向)
    );

    // 转换到世界坐标系
    const worldDirection = Cesium.Matrix4.multiplyByPointAsVector(
      enu,
      direction,
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(worldDirection, worldDirection);

    const ray = new Cesium.Ray(dronePosition, worldDirection);

    // 射线检测
    const result = viewer.scene.pickFromRay(ray);
    if (!result) {
      console.log(
        `❌ 水平射线未穿过任何物体 at horizontal: ${horizontalAngle}`
      );
      continue;
    }

    if (result) {
      const hitPosition = result.position;
      const distance = Cesium.Cartesian3.distance(dronePosition, hitPosition);

      // 只添加距离在合理范围内的点
      if (distance <= 200) {
        hits.push({
          position: hitPosition,
          distance: distance,
          ray: ray,
          type: "horizontal", // 标记为水平扫描
          horizontalAngle: horizontalAngle,
          verticalAngle: 0,
        });
      }
    }
  }

  // 按距离排序，取最近 topN 个
  hits.sort((a, b) => a.distance - b.distance);
  const topHits = hits.slice(0, topN);

  // 检查最近的障碍物并更新无人机标签
  updateDroneWarningLabel(droneEntity, topHits);

  // 可视化射线和标签
  topHits.forEach((hit) => {
    // 创建标签位置，稍微向上偏移以避免与地面重合
    const labelPosition = new Cesium.Cartesian3(
      hit.position.x,
      hit.position.y,
      hit.position.z + 5 // 向上偏移5米
    );

    // 添加射线和标签实体
    const entity = viewer.entities.add({
      polyline: {
        positions: [dronePosition, hit.position],
        width: 2,
        material:
          hit.distance < 50
            ? Cesium.Color.RED
            : hit.distance < 100
            ? Cesium.Color.ORANGE
            : Cesium.Color.GREEN,
      },
      position: labelPosition, // 将实体位置设置为标签位置
      label: {
        text: `${hit.distance.toFixed(1)}m (${hit.type})`,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // 确保标签始终可见
      },
    });

    // 将实体添加到viewer的rayEntities数组以便后续清除
    viewer._rayEntities.push(entity);
  });

  return topHits;
}

// 更新无人机警告标签
function updateDroneWarningLabel(droneEntity, hits) {
  if (!droneEntity || hits.length === 0) {
    // 如果没有检测到障碍物，隐藏警告标签
    droneEntity.label.show = false;
    droneEntity.label.text = "";
    return;
  }

  // 获取最近的障碍物
  const nearestHit = hits[0];
  const distance = nearestHit.distance;

  // 根据距离设置警告信息
  if (distance < 50) {
    // 距离小于50米：撞击警告
    droneEntity.label.show = true;
    droneEntity.label.text = `⚠️ 撞击警告! ${distance.toFixed(1)}m`;
    droneEntity.label.fillColor = Cesium.Color.WHITE;
    droneEntity.label.outlineColor = Cesium.Color.RED;
    droneEntity.label.outlineWidth = 4;
    droneEntity.label.font = "bold 20px sans-serif";
  } else if (distance < 100) {
    // 距离小于100米：接近警告
    droneEntity.label.show = true;
    droneEntity.label.text = `⚠️ 接近警告! ${distance.toFixed(1)}m`;
    droneEntity.label.fillColor = Cesium.Color.WHITE;
    droneEntity.label.outlineColor = Cesium.Color.ORANGE;
    droneEntity.label.outlineWidth = 3;
    droneEntity.label.font = "bold 18px sans-serif";
  } else {
    // 距离大于100米：无警告
    droneEntity.label.show = false;
    droneEntity.label.text = "";
  }
}
