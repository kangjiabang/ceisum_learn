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
            checkInterval = 500, // 检测间隔(ms)
            warningDistance = 50, // 预警距离(m)
            collisionDistance = 10 // 碰撞距离(m)
        } = options;

        // 清除已有检测
        this.disableCollisionWarning();

        this._warningInterval = setInterval(() => {
            const dronePos = droneEntity.position.getValue(this.viewer.clock.currentTime);

            for (const obstacle of obstacles) {
                const distance = this._calculateDistance(droneEntity, obstacle);

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
        const dronePos = droneEntity.position.getValue(this.viewer.clock.currentTime);
        const obstaclePos = obstacle.position?.getValue(this.viewer.clock.currentTime);

        return obstaclePos
            ? Cesium.Cartesian3.distance(dronePos, obstaclePos)
            : Infinity;
    }

    // 私有方法：触发碰撞
    _triggerCollision(droneEntity, obstacle) {
        console.warn(`碰撞预警！与 ${obstacle.name || '障碍物'} 发生碰撞`);

        // 飞机变红闪烁
        this._setDroneMaterial(
            droneEntity,
            new Cesium.ColorMaterialProperty(
                Cesium.Color.RED.withAlpha(0.8)
            ));

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

            // 黄色闪烁效果
            droneEntity.model.material = new Cesium.ColorMaterialProperty(
                Cesium.Color.YELLOW.withAlpha(0.6)
            );
        } else {
            // 恢复原始材质
            const original = this._originalMaterials.get(droneEntity);
            if (original) droneEntity.model.material = original;
        }
    }

    // 私有方法：设置飞机材质
    _setDroneMaterial(entity, material) {
        console.log("entity", entity);
        if (entity.model) {
            entity.model.material = material;
        }
    }
}
export { CollisionApi };