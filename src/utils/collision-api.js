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
        const dronePos = droneEntity.position.getValue(this.viewer.clock.currentTime);
        const rect = rectObstacle.rectangle.coordinates.getValue();
        const droneCarto = Cesium.Cartographic.fromCartesian(dronePos);

        const droneLon = droneCarto.longitude;
        const droneLat = droneCarto.latitude;

        const west = rect.west;
        const east = rect.east;
        const south = rect.south;
        const north = rect.north;

        // 判断是否在矩形内
        const isInside = (droneLon >= west && droneLon <= east &&
            droneLat >= south && droneLat <= north);

        // 计算到最近边界的经纬度距离
        let lonDist, latDist;

        if (isInside) {
            // 在内部：计算到边界的负距离
            const distToWest = droneLon - west;
            const distToEast = east - droneLon;
            const distToSouth = droneLat - south;
            const distToNorth = north - droneLat;

            // 取最小距离作为深入距离（负值）
            const minDist = Math.min(distToWest, distToEast, distToSouth, distToNorth);
            // 转换为米并返回负值
            const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
            return -Math.abs(minDist) * earthRadius;
        } else {
            // 在外部：计算到边界的正距离
            if (droneLon < west) {
                lonDist = west - droneLon;
            } else if (droneLon > east) {
                lonDist = droneLon - east;
            } else {
                lonDist = 0; // 在经度范围内
            }

            if (droneLat < south) {
                latDist = south - droneLat;
            } else if (droneLat > north) {
                latDist = droneLat - north;
            } else {
                latDist = 0; // 在纬度范围内
            }

            // 如果在矩形的水平投影范围内，只计算纬度距离
            if (droneLon >= west && droneLon <= east) {
                const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
                return Math.abs(latDist) * earthRadius;
            }

            // 如果在矩形的垂直投影范围内，只计算经度距离
            if (droneLat >= south && droneLat <= north) {
                const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
                return Math.abs(lonDist) * earthRadius * Math.cos(droneLat);
            }

            // 其他情况：计算到最近角点的距离
            const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
            const distance = Math.sqrt(
                Math.pow(lonDist * earthRadius * Math.cos(droneLat), 2) +
                Math.pow(latDist * earthRadius, 2)
            );

            return distance;
        }
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
                this._originalMaterials.set(droneEntity, droneEntity.model.color);
            }
            console.warn(`碰撞预警！ '障碍物' 发生预警`);


            droneEntity.model.color = new Cesium.CallbackProperty(function (time) {
                const alpha = 0.5 + 0.5 * Math.sin(Date.now() / 300); // 300ms周期
                return Cesium.Color.RED.withAlpha(alpha);
            }, false);
        } else {
            console.warn(`恢复到正常状态`);
            // 恢复原始材质
            const original = this._originalMaterials.get(droneEntity);
            // 如果有原始材质则恢复，即使为空，也进行设置
            droneEntity.model.color = original;
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
            const scale = 1.0 + 0.5 * Math.sin(Date.now() / 200);
            entity.model.scale = new Cesium.ConstantProperty(scale);

            return color;
        }, false);
    }
}
export { CollisionApi };