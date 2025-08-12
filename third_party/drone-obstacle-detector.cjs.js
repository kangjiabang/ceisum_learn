/*!
 * @your-org/drone-obstacle-detector v1.0.0
 * Drone obstacle detection library for CesiumJS
 * (c) 2025 Your Name
 * Released under the MIT License
 */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * 无人机障碍物检测器
 * Drone Obstacle Detector for CesiumJS
 */
class ObstacleDetector {
    /**
     * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
     * @param {Object} options - 配置选项
     */
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.options = {
            maxDistance: 200,           // 最大检测距离
            maxResults: 5,              // 最大返回结果数
            rayType: 'spherical',       // 射线类型: 'spherical', 'cone', 'fixed'
            rayConfig: {                // 射线配置
                latStep: 30,
                lonStep: 30,
                coneAngle: 30,
                rayCount: 12
            },
            entityLifetime: 3,          // 实体生命周期（秒）
            showRays: true,            // 是否显示射线
            showLabels: true,          // 是否显示标签
            ...options
        };

        this.rayEntities = [];
        this.onDetectionComplete = null;
    }

    /**
     * 执行障碍物检测
     * @param {Cesium.Cartesian3} position - 检测位置
     * @param {number} terrainHeight - 地形高度
     * @returns {Promise<Array>} 检测结果数组
     */
    async detect(position, terrainHeight) {
        try {
            this.clearRays();

            const rays = this._generateRays(position);
            const results = await this._processRays(position, rays, terrainHeight);

            // 排序并限制结果数量
            const sortedResults = results
                .sort((a, b) => a.distance - b.distance)
                .slice(0, this.options.maxResults);

            // 显示结果
            if (this.options.showRays && sortedResults.length > 0) {
                this._displayResults(position, sortedResults);
            }

            // 触发回调
            if (this.onDetectionComplete) {
                this.onDetectionComplete(sortedResults);
            }

            return sortedResults;
        } catch (error) {
            console.error('Obstacle detection failed:', error);
            return [];
        }
    }

    /**
     * 生成射线
     * @private
     */
    _generateRays(origin) {
        const { rayType, rayConfig } = this.options;

        switch (rayType) {
            case 'spherical':
                return this._generateSphericalRays(origin, rayConfig.latStep, rayConfig.lonStep);
            case 'cone':
                return this._generateConeRays(origin, rayConfig.rayCount, rayConfig.coneAngle);
            case 'fixed':
                return this._generateSixFixedRays(origin);
            default:
                return this._generateSphericalRays(origin, 30, 30);
        }
    }

    /**
     * 处理射线检测
     * @private
     */
    async _processRays(position, rays, terrainHeight) {
        const results = [];

        for (const rayInfo of rays) {
            const ray = new Cesium.Ray(position, rayInfo.direction);
            const excludeEntities = [this.options.droneEntity].filter(Boolean);
            const hitPoint = this.viewer.scene.pickFromRay(ray, excludeEntities);

            if (hitPoint && hitPoint.position) {
                const cartographicHit = Cesium.Cartographic.fromCartesian(hitPoint.position);
                const distance = Cesium.Cartesian3.distance(position, hitPoint.position);
                const buildingHeight = Math.max(0, cartographicHit.height - terrainHeight);

                if (distance < this.options.maxDistance) {
                    results.push({
                        rayInfo,
                        hitPoint,
                        distance,
                        buildingHeight,
                        position: hitPoint.position
                    });
                }
            }
        }

        return results;
    }

    /**
     * 显示检测结果
     * @private
     */
    _displayResults(dronePosition, results) {
        const startTime = this.viewer.clock.currentTime.clone();
        const stopTime = Cesium.JulianDate.addSeconds(startTime, this.options.entityLifetime, new Cesium.JulianDate());

        results.forEach((result, index) => {
            const { rayInfo, hitPoint, distance, buildingHeight } = result;

            // 显示射线
            if (this.options.showRays) {
                const rayEntity = this.viewer.entities.add({
                    availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                        start: startTime,
                        stop: stopTime
                    })]),
                    name: `obstacle_ray_${index}`,
                    polyline: {
                        positions: [
                            dronePosition,
                            Cesium.Cartesian3.add(
                                dronePosition,
                                Cesium.Cartesian3.multiplyByScalar(rayInfo.direction, 500, new Cesium.Cartesian3()),
                                new Cesium.Cartesian3()
                            )
                        ],
                        width: rayInfo.isCenterRay ? 6 : 4,
                        material: rayInfo.isCenterRay
                            ? new Cesium.PolylineOutlineMaterialProperty({
                                color: Cesium.Color.RED,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 1
                            })
                            : new Cesium.PolylineGlowMaterialProperty({
                                color: Cesium.Color.BLUE.withAlpha(0.7),
                                glowPower: 0.1
                            })
                    }
                });
                this.rayEntities.push(rayEntity);
            }

            // 显示碰撞点
            const label = this.options.showLabels
                ? {
                    text: `#${index + 1} 高度: ${buildingHeight.toFixed(1)}m\n距离: ${distance.toFixed(1)}m`,
                    font: '12px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, -30)
                }
                : undefined;

            const hitEntity = this.viewer.entities.add({
                availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                    start: startTime,
                    stop: stopTime
                })]),
                name: `obstacle_point_${index}`,
                position: hitPoint.position,
                point: {
                    pixelSize: rayInfo.isCenterRay ? 30 : 20,
                    color: distance < 100 ? Cesium.Color.RED :
                        distance < 200 ? Cesium.Color.ORANGE : Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2
                },
                label
            });
            this.rayEntities.push(hitEntity);
        });

        // 添加统计信息
        if (this.options.showLabels && results.length > 0) {
            const statsEntity = this.viewer.entities.add({
                availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                    start: startTime,
                    stop: stopTime
                })]),
                name: 'obstacle_stats',
                position: dronePosition,
                label: {
                    text: `检测到 ${results.length} 个障碍物`,
                    font: '14px sans-serif',
                    fillColor: Cesium.Color.CYAN,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, 30)
                }
            });
            this.rayEntities.push(statsEntity);
        }
    }

    /**
     * 清除所有射线实体
     */
    clearRays() {
        this.rayEntities.forEach(entity => {
            if (this.viewer.entities.contains(entity)) {
                this.viewer.entities.remove(entity);
            }
        });
        this.rayEntities = [];
    }

    /**
     * 设置检测完成回调
     * @param {Function} callback - 回调函数
     */
    setOnDetectionComplete(callback) {
        this.onDetectionComplete = callback;
    }

    /**
     * 更新配置
     * @param {Object} options - 新的配置选项
     */
    updateOptions(options) {
        this.options = { ...this.options, ...options };
    }

    // 射线生成方法（保持与原代码一致）
    _generateSphericalRays(origin, latStepDegrees = 30, lonStepDegrees = 30) {
        const rays = [];
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

        for (let lat = -90; lat <= 90; lat += latStepDegrees) {
            const latRad = Cesium.Math.toRadians(lat);
            const lonCount = (lat === -90 || lat === 90) ? 1 : Math.floor(360 / lonStepDegrees);

            for (let i = 0; i < lonCount; i++) {
                const lon = i * lonStepDegrees;
                const lonRad = Cesium.Math.toRadians(lon);

                const x = Math.cos(latRad) * Math.cos(lonRad);
                const y = Math.cos(latRad) * Math.sin(lonRad);
                const z = Math.sin(latRad);

                const localDirection = new Cesium.Cartesian3(x, y, z);
                const worldDirection = new Cesium.Cartesian3();
                Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDirection, worldDirection);
                Cesium.Cartesian3.normalize(worldDirection, worldDirection);

                rays.push({
                    direction: worldDirection,
                    latitude: lat,
                    longitude: lon,
                    isCenterRay: false
                });
            }
        }

        return rays;
    }

    _getLocalDownDirection(position) {
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
        const downDirection = new Cesium.Cartesian3();
        Cesium.Matrix4.multiplyByPointAsVector(
            enuMatrix,
            new Cesium.Cartesian3(0, 0, -1),
            downDirection
        );
        Cesium.Cartesian3.normalize(downDirection, downDirection);
        return downDirection;
    }

    _generateConeRays(origin, rayCount = 12, coneAngle = 30) {
        const rays = [];
        const localDown = this._getLocalDownDirection(origin);
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

        if (rayCount === 1) {
            rays.push({
                direction: localDown,
                isCenterRay: true
            });
            return rays;
        }

        for (let i = 0; i < rayCount; i++) {
            if (i === 0) {
                rays.push({
                    direction: localDown,
                    horizontalAngle: 0,
                    verticalAngle: 0,
                    isCenterRay: true
                });
            } else {
                const surroundingRays = rayCount - 1;
                const index = i - 1;
                const horizontalAngle = (index / surroundingRays) * 2 * Math.PI;
                const coneAngleRad = Cesium.Math.toRadians(coneAngle);

                const x = Math.sin(coneAngleRad) * Math.cos(horizontalAngle);
                const y = Math.sin(coneAngleRad) * Math.sin(horizontalAngle);
                const z = -Math.cos(coneAngleRad);

                const localDirection = new Cesium.Cartesian3(x, y, z);
                const worldDirection = new Cesium.Cartesian3();
                Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDirection, worldDirection);
                Cesium.Cartesian3.normalize(worldDirection, worldDirection);

                rays.push({
                    direction: worldDirection,
                    horizontalAngle: Cesium.Math.toDegrees(horizontalAngle),
                    verticalAngle: coneAngle,
                    isCenterRay: false
                });
            }
        }

        return rays;
    }

    _generateSixFixedRays(origin) {
        const rays = [];
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

        const localDirections = [
            new Cesium.Cartesian3(0, 0, 1),   // 上 (天)
            new Cesium.Cartesian3(0, 0, -1),  // 下 (地)
            new Cesium.Cartesian3(1, 0, 0),   // 东
            new Cesium.Cartesian3(0, 1, 0),   // 北
            new Cesium.Cartesian3(-1, 0, 0),  // 西
            new Cesium.Cartesian3(0, -1, 0),  // 南
        ];

        localDirections.forEach((localDir, index) => {
            const worldDir = new Cesium.Cartesian3();
            Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDir, worldDir);
            Cesium.Cartesian3.normalize(worldDir, worldDir);
            rays.push({
                direction: worldDir,
                description: ['上', '下', '东', '北', '西', '南'][index],
                isCenterRay: false
            });
        });

        return rays;
    }
}

/**
 * 工具函数
 */

/**
 * 生成球面分布射线
 */
function generateSphericalRays(origin, latStepDegrees = 30, lonStepDegrees = 30) {
    const rays = [];
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

    for (let lat = -90; lat <= 90; lat += latStepDegrees) {
        const latRad = Cesium.Math.toRadians(lat);
        const lonCount = (lat === -90 || lat === 90) ? 1 : Math.floor(360 / lonStepDegrees);

        for (let i = 0; i < lonCount; i++) {
            const lon = i * lonStepDegrees;
            const lonRad = Cesium.Math.toRadians(lon);

            const x = Math.cos(latRad) * Math.cos(lonRad);
            const y = Math.cos(latRad) * Math.sin(lonRad);
            const z = Math.sin(latRad);

            const localDirection = new Cesium.Cartesian3(x, y, z);
            const worldDirection = new Cesium.Cartesian3();
            Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDirection, worldDirection);
            Cesium.Cartesian3.normalize(worldDirection, worldDirection);

            rays.push({
                direction: worldDirection,
                latitude: lat,
                longitude: lon,
                isCenterRay: false
            });
        }
    }

    return rays;
}

/**
 * 生成锥形分布射线
 */
function generateConeRays(origin, rayCount = 12, coneAngle = 30) {
    const rays = [];
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

    // 获取局部坐标系的"下"方向
    const localDown = getLocalDownDirection(origin);

    if (rayCount === 1) {
        rays.push({
            direction: localDown,
            isCenterRay: true
        });
        return rays;
    }

    for (let i = 0; i < rayCount; i++) {
        if (i === 0) {
            rays.push({
                direction: localDown,
                horizontalAngle: 0,
                verticalAngle: 0,
                isCenterRay: true
            });
        } else {
            const surroundingRays = rayCount - 1;
            const index = i - 1;
            const horizontalAngle = (index / surroundingRays) * 2 * Math.PI;
            const coneAngleRad = Cesium.Math.toRadians(coneAngle);

            const x = Math.sin(coneAngleRad) * Math.cos(horizontalAngle);
            const y = Math.sin(coneAngleRad) * Math.sin(horizontalAngle);
            const z = -Math.cos(coneAngleRad);

            const localDirection = new Cesium.Cartesian3(x, y, z);
            const worldDirection = new Cesium.Cartesian3();
            Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDirection, worldDirection);
            Cesium.Cartesian3.normalize(worldDirection, worldDirection);

            rays.push({
                direction: worldDirection,
                horizontalAngle: Cesium.Math.toDegrees(horizontalAngle),
                verticalAngle: coneAngle,
                isCenterRay: false
            });
        }
    }

    return rays;
}

/**
 * 生成固定六个方向的射线
 */
function generateSixFixedRays(origin) {
    const rays = [];
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);

    const localDirections = [
        new Cesium.Cartesian3(0, 0, 1),   // 上 (天)
        new Cesium.Cartesian3(0, 0, -1),  // 下 (地)
        new Cesium.Cartesian3(1, 0, 0),   // 东
        new Cesium.Cartesian3(0, 1, 0),   // 北
        new Cesium.Cartesian3(-1, 0, 0),  // 西
        new Cesium.Cartesian3(0, -1, 0),  // 南
    ];

    localDirections.forEach((localDir, index) => {
        const worldDir = new Cesium.Cartesian3();
        Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, localDir, worldDir);
        Cesium.Cartesian3.normalize(worldDir, worldDir);
        rays.push({
            direction: worldDir,
            description: ['上', '下', '东', '北', '西', '南'][index],
            isCenterRay: false
        });
    });

    return rays;
}

/**
 * 获取局部向下方向
 */
function getLocalDownDirection(position) {
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const downDirection = new Cesium.Cartesian3();
    Cesium.Matrix4.multiplyByPointAsVector(
        enuMatrix,
        new Cesium.Cartesian3(0, 0, -1),
        downDirection
    );
    Cesium.Cartesian3.normalize(downDirection, downDirection);
    return downDirection;
}

exports.ObstacleDetector = ObstacleDetector;
exports.default = ObstacleDetector;
exports.generateConeRays = generateConeRays;
exports.generateSixFixedRays = generateSixFixedRays;
exports.generateSphericalRays = generateSphericalRays;
//# sourceMappingURL=drone-obstacle-detector.cjs.js.map
