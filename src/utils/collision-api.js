import * as Cesium from 'cesium';
// collision-api.js
class CollisionApi {
    constructor(viewer) {
        this.viewer = viewer;
        this._warningInterval = null;
        this._originalMaterials = new WeakMap(); // 保存原始材质
    }

    /**
     * 启用碰撞检测（持续监测）
     * @param {Cesium.Entity} droneEntity 无人机实体
     * @param {Cesium.Entity[]} obstacles 障碍物数组
     * @param {Object} options 配置项
     */
    enableCollisionWarning(droneEntity, obstacles, options = {}) {
        const {
            checkInterval = 100, // 检测间隔(ms)
            warningDistance = 500, // 预警距离(m)
            collisionDistance = 10 // 碰撞距离(m)
        } = options;

        // 清除已有检测
        this.disableCollisionWarning();

        this._warningInterval = setInterval(() => {
            const dronePos = droneEntity.position.getValue(this.viewer.clock.currentTime);

            for (const obstacle of obstacles) {
                let distance;

                // 判断障碍物类型
                if (obstacle.customType === 'circle') {
                    // 圆形禁飞区
                    distance = this._calculateCircleDistance(droneEntity, obstacle);
                    console.log("距离圆形禁飞区距离:", distance);
                } else if (obstacle.customType === 'rectangle') {
                    // 矩形禁飞区
                    distance = this._calculateRectangleDistance(droneEntity, obstacle);
                    console.log("距离矩形禁飞区距离:", distance);
                } else {
                    continue; // 未知类型跳过
                }

                if (distance < collisionDistance) {
                    this._triggerCollision(droneEntity, obstacle); // 触发碰撞
                    break;
                } else if (distance < warningDistance) {
                    this._triggerWarning(droneEntity, true); // 触发预警
                    break;
                } else {
                    this._triggerWarning(droneEntity, false); // 恢复正常
                }
            }
        }, checkInterval);
    }

    /**
     * 关闭碰撞检测
     */
    disableCollisionWarning() {
        if (this._warningInterval) {
            clearInterval(this._warningInterval);
            this._warningInterval = null;
        }
    }

    // 私有方法：计算距离
    _calculateDistance(droneEntity, obstacle) {
        switch (obstacle.customType) {
            case 'circle':
                return this._calculateCircleDistance(droneEntity, obstacle);
            case 'rectangle':
                return this._calculateRectangleDistance(droneEntity, obstacle);
            default:
                return Infinity;
        }
    }

    /**
 * 计算无人机到平面圆形禁飞区的碰撞距离
 * @param {Cesium.Entity} droneEntity 无人机实体
 * @param {Cesium.Entity} planeObstacle 平面禁飞区实体
 * @returns {number} 距离（米），≤0 表示已进入禁飞区
 */
    _calculateCircleDistance(droneEntity, circleObstacle) {
        // 1. 获取无人机和禁飞区中心的当前坐标
        const dronePos = droneEntity.position.getValue(this.viewer.clock.currentTime);
        const circlePos = circleObstacle.position.getValue(this.viewer.clock.currentTime);

        // 2. 投影到椭球面（消除高度影响）
        const ellipsoid = this.viewer.scene.globe.ellipsoid;
        const droneSurfacePos = ellipsoid.scaleToGeodeticSurface(dronePos, new Cesium.Cartesian3());
        const circleSurfacePos = ellipsoid.scaleToGeodeticSurface(circlePos, new Cesium.Cartesian3());

        // 3. 计算纯水平距离
        const horizontalDistance = Cesium.Cartesian3.distance(droneSurfacePos, circleSurfacePos);

        // 4. 返回与半径的差值
        return horizontalDistance - circleObstacle.ellipse.semiMajorAxis;
    }

    /**
 * 计算无人机到矩形禁飞区的距离
 * @param {Cesium.Entity} droneEntity 无人机实体
 * @param {Cesium.Entity} rectObstacle 矩形禁飞区实体
 * @returns {number} 距离（米），≤0 表示已进入禁飞区
 */
    _calculateRectangleDistance(droneEntity, rectObstacle) {
        const dronePos = droneEntity.position.getValue(viewer.clock.currentTime);
        const rect = rectObstacle.rectangle.coordinates.getValue();

        // 将矩形转换为多边形点
        const rectanglePolygon = [
            Cesium.Cartesian3.fromRadians(rect.west, rect.south),
            Cesium.Cartesian3.fromRadians(rect.east, rect.south),
            Cesium.Cartesian3.fromRadians(rect.east, rect.north),
            Cesium.Cartesian3.fromRadians(rect.west, rect.north),
            Cesium.Cartesian3.fromRadians(rect.west, rect.south) // 闭合
        ];

        // 使用 Cesium 计算点到多边形的距离
        const distance = Cesium.PolygonPipeline.distanceToPoint(dronePos, rectanglePolygon);

        // 判断是否在内部
        const droneCarto = Cesium.Cartographic.fromCartesian(dronePos);
        const isInside = Cesium.Rectangle.contains(rect, droneCarto.longitude, droneCarto.latitude);

        return isInside ? -distance : distance;
    }


    // 私有方法：触发碰撞
    _triggerCollision(droneEntity, obstacle) {
        console.warn(`碰撞预警！与 ${obstacle.name || '障碍物'} 发生碰撞`);

        // 飞机变红闪烁
        this._setDroneMaterial(
            droneEntity);

        // 可以在此触发外部回调
        if (this.onCollision) this.onCollision(droneEntity, obstacle);
    }

    // 私有方法：触发预警
    _triggerWarning(droneEntity, isWarning) {
        if (isWarning) {
            // 保存原始材质（如果未保存）
            if (!this._originalMaterials.has(droneEntity)) {
                this._originalMaterials.set(droneEntity, droneEntity.model.material);
            }
            console.warn(`碰撞预警！ '障碍物' 发生预警`);


            droneEntity.model.color = new Cesium.CallbackProperty(function (time) {
                const alpha = 0.5 + 0.5 * Math.sin(Date.now() / 300); // 300ms周期
                return Cesium.Color.RED.withAlpha(alpha);
            }, false);
        } else {
            // 恢复原始材质
            const original = this._originalMaterials.get(droneEntity);
            if (original) droneEntity.model.material = original;
        }
    }

    // 私有方法：设置飞机材质
    _setDroneMaterial(entity) {
        console.log("entity", entity);
        entity.model.color = new Cesium.CallbackProperty(function (time) {
            // 彩虹色循环 (HSV色彩空间)
            const hue = (Date.now() / 1000) % 1.0; // 1秒完成一个色相循环
            const color = Cesium.Color.fromHsl(hue, 1.0, 0.5, 0.8);

            // 脉冲缩放 (0.8~1.2倍)
            const scale = 1.0 + 0.2 * Math.sin(Date.now() / 200);
            entity.model.scale = new Cesium.ConstantProperty(scale);

            return color;
        }, false);
    }
}
export { CollisionApi };