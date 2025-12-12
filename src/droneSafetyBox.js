// droneSafetyBox.js
import * as Cesium from "cesium";
import * as turf from "@turf/turf";

const MODEL_HEADING_OFFSET_DEGREES = -90; // 无人机模型通常需要-90度偏移

/**
 * 计算包围盒的中心位置（基于无人机位置和方向四元数）
 * @param {Object} dronePos - {lon, lat, alt}
 * @param {Cesium.Quaternion} quat - 无人机的方向四元数
 * @param {number} L_forward - 前方长度
 * @param {number} L_back - 后方长度
 * @returns {Cesium.Cartesian3} 包围盒的中心世界坐标
 */
function computeBoxPosition(dronePos, quat, L_forward, L_back) {
  // 包围盒中心相对于无人机中心的偏移量
  // Box Length = L_forward + L_back
  // Box Center = L_forward - Box Length / 2 = L_forward - (L_forward + L_back) / 2 = (L_forward - L_back) / 2
  const D_offset = (L_forward - L_back) / 2;

  // 1. 在局部坐标系（Box 坐标系）中定义偏移向量 (X轴是Box的长轴方向)
  const offsetLocal = new Cesium.Cartesian3(D_offset, 0, 0);

  // 2. 将四元数转为旋转矩阵
  const rotMat = Cesium.Matrix3.fromQuaternion(quat);

  // 3. 将局部偏移向量旋转到世界坐标系
  const offsetWorld = Cesium.Matrix3.multiplyByVector(
    rotMat,
    offsetLocal,
    new Cesium.Cartesian3()
  );

  // 4. 获取无人机的世界坐标
  const worldPos = Cesium.Cartesian3.fromDegrees(
    dronePos.lon,
    dronePos.lat,
    dronePos.alt
  );

  // 5. 将无人机世界坐标加上世界偏移，得到 Box 的中心位置
  return Cesium.Cartesian3.add(worldPos, offsetWorld, new Cesium.Cartesian3());
}

/**
 * 安全包围盒管理器
 */
export class DroneSafetyBox {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.options = {
      T_alert: options.T_alert ?? 10,
      L_min: options.L_min ?? 20,
      L_max: options.L_max ?? 100,
      boxHeight: options.boxHeight ?? 20,
      boxWidth: options.boxWidth ?? 10,
    };

    // 内部状态（供 CallbackProperty 读取）
    this._boxPos = new Cesium.Cartesian3();
    this._boxOri = Cesium.Quaternion.IDENTITY;
    this._boxLength = 0;
    this._color = Cesium.Color.GREEN.withAlpha(0.3);
    this._outlineColor = Cesium.Color.GREEN;
    this._labelText = "初始化中...";

    this._currentDronePos = null; // 缓存 {lon, lat, alt}

    // ... (实体创建部分不变) ...
    this._boxEntity = this.viewer.entities.add({
      name: "DroneSafetyBox_CollisionBox",
      position: new Cesium.CallbackProperty(() => this._boxPos, false),
      orientation: new Cesium.CallbackProperty(() => this._boxOri, false),
      box: {
        dimensions: new Cesium.CallbackProperty(
          () =>
            new Cesium.Cartesian3(
              this._boxLength,
              this.options.boxWidth,
              this.options.boxHeight
            ),
          false
        ),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => this._color, false)
        ),
        outline: true,
        outlineColor: new Cesium.CallbackProperty(
          () => this._outlineColor,
          false
        ),
      },
    });

    this._labelEntity = this.viewer.entities.add({
      position: new Cesium.CallbackProperty(() => this._boxPos, false),
      label: {
        text: new Cesium.CallbackProperty(() => this._labelText, false),
        font: "18px sans-serif",
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.5),
        pixelOffset: new Cesium.Cartesian2(0, -40),
      },
    });
  }

  /**
   * 更新包围盒状态
   * @param {Object} currentDrone - {lon, lat, alt, gs, heading}
   * heading: 航向角（度，正北为0，顺时针增加）
   * @param {Array} fixedDrones - [{lon, lat, alt}, ...]
   * @returns {number} 最小距离（米）
   */
  update(currentDrone, fixedDrones) {
    const { lon, lat, alt, gs, heading } = currentDrone;

    // 缓存当前位置
    this._currentDronePos = { lon, lat, alt };

    // 1. 计算包围盒参数
    const L_forward = Math.min(
      this.options.L_min + (gs || 1) * this.options.T_alert,
      this.options.L_max
    );
    const L_back = this.options.L_min / 2;
    const boxLength = L_forward + L_back;

    // 2. 计算方向四元数
    // heading 是角度，先转为弧度
    const headingRad = Cesium.Math.toRadians(heading || 0);

    // 加上模型偏移量
    const correctedHeading =
      headingRad + Cesium.Math.toRadians(MODEL_HEADING_OFFSET_DEGREES);

    const posCart = Cesium.Cartesian3.fromDegrees(lon, lat, alt);

    // 使用 headingPitchRollQuaternion 获取方向四元数
    const quat = Cesium.Transforms.headingPitchRollQuaternion(
      posCart,
      new Cesium.HeadingPitchRoll(correctedHeading, 0, 0)
    );

    // 3. 计算包围盒中心位置 (✅ 使用修复后的函数)
    const boxPos = computeBoxPosition(
      { lon, lat, alt },
      quat,
      L_forward,
      L_back
    );

    // 4. 计算最小距离
    // 注意：getBoxCornersLonLat 依赖 quat, boxLength, boxPos
    const corners = this.getBoxCornersLonLat(
      boxPos,
      quat,
      boxLength,
      this.options.boxWidth,
      this.options.boxHeight
    );
    const minDistance = this.computeMinDistanceToFixedDrones(
      corners,
      fixedDrones
    );

    // 5. 更新颜色和文本 (逻辑不变)
    let color, outlineColor, labelText;
    if (minDistance > 100) {
      color = Cesium.Color.GREEN.withAlpha(0.3);
      outlineColor = Cesium.Color.GREEN;
      labelText = `安全：最小距离 ${minDistance.toFixed(2)} m`;
    } else if (minDistance > 50) {
      color = Cesium.Color.YELLOW.withAlpha(0.4);
      outlineColor = Cesium.Color.ORANGE;
      labelText = `注意：最小距离 ${minDistance.toFixed(2)} m（中等）`;
    } else {
      color = Cesium.Color.RED.withAlpha(0.5);
      outlineColor = Cesium.Color.RED;
      labelText = `警告：最小距离 ${minDistance.toFixed(2)} m（危险）`;
    }

    // 6. 更新内部状态
    this._boxPos = boxPos;
    this._boxOri = quat;
    this._boxLength = boxLength;
    this._color = color;
    this._outlineColor = outlineColor;
    this._labelText = labelText;

    return minDistance;
  }

  // ... (flyToDrone, getBoxCornersLonLat, computeMinDistanceToFixedDrones, destroy 保持不变) ...
  computeMinDistanceToFixedDrones(boxCorners, fixedDrones) {
    const topFace = [
      boxCorners[0],
      boxCorners[1],
      boxCorners[2],
      boxCorners[3],
    ];
    const ring = [...topFace, topFace[0]];
    const poly = turf.polygon([ring]);

    let minDist = Infinity;
    for (const fd of fixedDrones) {
      const p = turf.point([fd.lon, fd.lat]);
      if (turf.booleanPointInPolygon(p, poly)) return 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const line = turf.lineString([ring[i], ring[i + 1]]);
        const d = turf.pointToLineDistance(p, line, { units: "meters" });
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }
  /**
   * 销毁实体（可选）
   */
  destroy() {
    this.viewer.entities.remove(this._boxEntity);
    this.viewer.entities.remove(this._labelEntity);
  }
  // 在 class DroneSafetyBox 内部添加：

  getBoxCornersLonLat(
    boxPos,
    boxOri,
    boxLength,
    boxWidth = 10,
    boxHeight = 20
  ) {
    const half = new Cesium.Cartesian3(
      boxLength / 2,
      boxWidth / 2,
      boxHeight / 2
    );
    const cornersLocal = [
      [+half.x, +half.y, +half.z],
      [+half.x, -half.y, +half.z],
      [-half.x, -half.y, +half.z],
      [-half.x, +half.y, +half.z],
      [+half.x, +half.y, -half.z],
      [+half.x, -half.y, -half.z],
      [-half.x, -half.y, -half.z],
      [-half.x, +half.y, -half.z],
    ];
    const rotMat = Cesium.Matrix3.fromQuaternion(boxOri);
    return cornersLocal.map((c) => {
      const local = new Cesium.Cartesian3(c[0], c[1], c[2]);
      const rotated = Cesium.Matrix3.multiplyByVector(
        rotMat,
        local,
        new Cesium.Cartesian3()
      );
      const world = Cesium.Cartesian3.add(
        boxPos,
        rotated,
        new Cesium.Cartesian3()
      );
      const carto = Cesium.Cartographic.fromCartesian(world);
      return [
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
      ];
    });
  }

  /**
   * 飞向当前无人机位置
   * @param {Object} options - Cesium flyTo 选项，如 { duration: 2.0, offset: ... }
   */
  flyToDrone(options = {}) {
    if (!this._currentDronePos) {
      console.warn("Drone position not set yet. Call update() first.");
      return;
    }

    const { lon, lat, alt } = this._currentDronePos;
    const destination = Cesium.Cartesian3.fromDegrees(
      lon,
      lat,
      (alt || 0) + 50
    ); // 稍微抬高视角

    // 默认偏移：俯视角度
    const defaultOffset = new Cesium.HeadingPitchRange(
      0, // heading
      Cesium.Math.toRadians(-45), // pitch (俯视角)
      150 // range (距离，米)
    );

    this.viewer.camera.flyTo({
      destination,
      orientation: {
        heading: defaultOffset.heading,
        pitch: defaultOffset.pitch,
        roll: 0,
      },
      duration: options.duration ?? 2.0,
      ...options,
    });
  }
  // 移除错误的 computeBoxPositionFromHeading

  getBoxCornersLonLat(
    boxPos,
    boxOri,
    boxLength,
    boxWidth = 10,
    boxHeight = 20
  ) {
    // ... (保持不变) ...
    const half = new Cesium.Cartesian3(
      boxLength / 2,
      boxWidth / 2,
      boxHeight / 2
    );
    const cornersLocal = [
      [+half.x, +half.y, +half.z],
      [+half.x, -half.y, +half.z],
      [-half.x, -half.y, +half.z],
      [-half.x, +half.y, +half.z],
      [+half.x, +half.y, -half.z],
      [+half.x, -half.y, -half.z],
      [-half.x, -half.y, -half.z],
      [-half.x, +half.y, -half.z],
    ];
    const rotMat = Cesium.Matrix3.fromQuaternion(boxOri);
    return cornersLocal.map((c) => {
      const local = new Cesium.Cartesian3(c[0], c[1], c[2]);
      const rotated = Cesium.Matrix3.multiplyByVector(
        rotMat,
        local,
        new Cesium.Cartesian3()
      );
      const world = Cesium.Cartesian3.add(
        boxPos,
        rotated,
        new Cesium.Cartesian3()
      );
      const carto = Cesium.Cartographic.fromCartesian(world);
      return [
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
      ];
    });
  }

  computeMinDistanceToFixedDrones(boxCorners, fixedDrones) {
    // ... (保持不变) ...
    const topFace = [
      boxCorners[0],
      boxCorners[1],
      boxCorners[2],
      boxCorners[3],
    ];
    const ring = [...topFace, topFace[0]];
    const poly = turf.polygon([ring]);

    let minDist = Infinity;
    for (const fd of fixedDrones) {
      const p = turf.point([fd.lon, fd.lat]);
      if (turf.booleanPointInPolygon(p, poly)) return 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const line = turf.lineString([ring[i], ring[i + 1]]);
        const d = turf.pointToLineDistance(p, line, { units: "meters" });
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  destroy() {
    this.viewer.entities.remove(this._boxEntity);
    this.viewer.entities.remove(this._labelEntity);
  }
}

// ⚠️ 注意：文件顶部的 computeHeadingQuaternion 现在没有使用，可以移除或保留。
// function computeHeadingQuaternion(position, nextWp) { ... }
