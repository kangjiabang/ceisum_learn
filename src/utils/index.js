import * as Cesium from 'cesium';
import { generateInterpolatedPoints } from './path-interpolator';
import { CollisionApi } from './collision-api';


class DronePath {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.options = {
            modelAssetId: 3472138, // 默认无人机模型
            segmentPoints: 10,     // 每段插值点数
            pointInterval: 2,      // 点间隔时间(秒)
            ...options
        };
        this.entities = [];
        this.smoothWaypoints = null; // 保存平滑路径点
        this.sampledPosition = null; // 保存采样位置
        this.startTime = null;       // 保存开始时间
        this.collisionApi = new CollisionApi(viewer);
        // 暴露事件回调
        this.onCollision = null; // 外部可赋值为函数

    }

    /**
 * 获取无人机当前世界坐标位置
 * @returns {Cesium.Cartesian3|null} 当前位置，若无数据则返回 null
 */
    getCurrentPosition() {
        if (!this.sampledPosition || !this.startTime) {
            console.warn("尚未创建飞行路径或未开始飞行。");
            return null;
        }

        // 获取当前时钟时间（模拟时间）
        const currentTime = this.viewer.clock.currentTime;

        // 检查是否在有效时间段内
        if (
            Cesium.JulianDate.lessThan(currentTime, this.startTime) ||
            Cesium.JulianDate.greaterThan(currentTime, this.viewer.clock.stopTime)
        ) {
            console.warn("当前时间超出飞行路径时间范围。");
            return null;
        }

        try {
            // 获取插值位置
            return this.sampledPosition.getValue(currentTime);
        } catch (err) {
            console.warn("无法获取当前位置：", err.message);
            return null;
        }
    }

    /**
     * 创建飞行路径
     * @param {Array} waypoints - 航点数组 [{lon, lat, alt}, ...]
     * @param {Object} options - 可选参数
     */
    async createFlightPath(waypoints, options = {}) {
        const mergedOptions = { ...this.options, ...options };

        // 生成平滑路径
        this.smoothWaypoints = generateInterpolatedPoints(
            waypoints,
            mergedOptions.segmentPoints
        );

        // 创建时间序列位置
        this.startTime = Cesium.JulianDate.now();
        this.sampledPosition = new Cesium.SampledPositionProperty();

        this.smoothWaypoints.forEach((point, index) => {
            const time = Cesium.JulianDate.addSeconds(
                this.startTime,
                index * mergedOptions.pointInterval,
                new Cesium.JulianDate()
            );
            const position = Cesium.Cartesian3.fromDegrees(
                point.lon,
                point.lat,
                point.alt
            );
            this.sampledPosition.addSample(time, position);
        });

        // 加载模型
        const modelUri = await Cesium.IonResource.fromAssetId(mergedOptions.modelAssetId);

        // 创建无人机实体
        const droneEntity = this.viewer.entities.add({
            name: options.name || "无人机",
            position: this.sampledPosition,
            orientation: new Cesium.VelocityOrientationProperty(this.sampledPosition),
            model: {
                uri: modelUri,
                scale: mergedOptions.modelScale || 1.0,
                minimumPixelSize: mergedOptions.minPixelSize || 64,
            }
        });

        // 可选: 添加路径线
        if (mergedOptions.showPath) {
            this.viewer.entities.add({
                name: `${options.name || '无人机'}路径`,
                polyline: {
                    positions: this.smoothWaypoints.map(p =>
                        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)
                    ),
                    width: mergedOptions.pathWidth || 2,
                    material: mergedOptions.pathColor || Cesium.Color.CYAN.withAlpha(0.6),
                }
            });
        }

        this.entities.push(droneEntity);

        return droneEntity;
    }

    /**
     * 开始飞行动画
     * @param {Object} options - 可选参数
     */
    startFlight(options = {}) {
        const mergedOptions = { ...this.options, ...options };

        if (!this.smoothWaypoints || !this.sampledPosition || !this.startTime) {
            throw new Error("请先调用 createFlightPath 方法创建飞行路径！");
        }

        // 设置时间范围
        const stopTime = Cesium.JulianDate.addSeconds(
            this.startTime,
            this.smoothWaypoints.length * mergedOptions.pointInterval,
            new Cesium.JulianDate()
        );

        this.viewer.clock.startTime = this.startTime.clone();
        this.viewer.clock.stopTime = stopTime;
        this.viewer.clock.currentTime = this.startTime.clone();
        this.viewer.clock.clockRange = Cesium.ClockRange.CLAMPED; // 只播放一次
        this.viewer.clock.multiplier = mergedOptions.multiplier || 1;
        this.viewer.clock.shouldAnimate = true;

        // 设置时间轴范围
        this.viewer.timeline.zoomTo(this.viewer.clock.startTime, this.viewer.clock.stopTime);

        // 追踪无人机实体
        if (this.entities.length > 0) {
            this.viewer.trackedEntity = this.entities[0];
        }
    }

    /**
   * 启用空域碰撞检测
   * @param {Cesium.Entity[]} airspaces 空域实体数组
   * @param {Object} options 配置项
   */
    enableAirspaceCollisionDetection(airspaces, options = {}) {
        if (!this.entities.length) return;

        this.collisionApi.onCollision = (drone, obstacle) => {
            console.error(`[DRONE] 碰撞发生在 ${obstacle.name}`);
            if (this.onCollision) this.onCollision(drone, obstacle);
        };

        this.collisionApi.enableCollisionWarning(
            this.entities[0], // 无人机实体
            airspaces,
            options
        );
    }

    clear() {
        this.entities.forEach(entity => {
            this.viewer.entities.remove(entity);
        });
        this.entities = [];
        this.smoothWaypoints = null;
        this.sampledPosition = null;
        this.startTime = null;
    }
}

export default DronePath; 