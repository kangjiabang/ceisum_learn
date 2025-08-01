export async function calculateBuildingsHeight(viewer, position) {

    // 生成锥形射线（垂直向下为中心）
    const coneRays = generateConeRays(position, 6, 1); // 9条射线，45度锥形角

    let validHeights = []; // 用于存储有效的建筑物高度
    let detectionDetails = []; // 用于存储检测详情（可选，用于调试）

    // 处理每条射线
    coneRays.forEach((rayInfo, rayIndex) => {
        const ray = new Cesium.Ray(position, rayInfo.direction);

        // 可视化射线
        //showRayBuildingHeight();
        // 射线检测
        const hitPoint = viewer.scene.pickFromRay(ray);
        if (!hitPoint) {
            console.log(`❌ 射线${rayIndex}未穿过任何物体`);
            return;
        }

        if (hitPoint.position) {
            const cartographicHit = Cesium.Cartographic.fromCartesian(hitPoint.position);
            const distance = Cesium.Cartesian3.distance(position, hitPoint.position);

            // 计算建筑物高度
            const buildingHeight = Math.max(0, cartographicHit.height);

            const minHeightThreshold = 20.0; // 最小高度阈值，避免误报
            detectionDetails.push({
                rayIndex: rayIndex,
                hitHeight: buildingHeight,
                distance: distance
            });

            if (buildingHeight > minHeightThreshold) {
                validHeights.push(buildingHeight);
            }


            console.log(
                `📍 射线${rayIndex}碰撞点: 经度=${Cesium.Math.toDegrees(cartographicHit.longitude).toFixed(6)}, ` +
                `纬度=${Cesium.Math.toDegrees(cartographicHit.latitude).toFixed(6)}, ` +
                `碰撞点高度=${cartographicHit.height.toFixed(2)}米, ` +
                `建筑物高度=${buildingHeight.toFixed(2)}米, ` +
                `距离=${distance.toFixed(2)}米`
            );
        } else {
            console.log(`❌ 射线${rayIndex}未命中地形`);

        }

        function showRayBuildingHeight() {
            viewer.entities.add({
                name: `射线_${rayIndex}`,
                polyline: {
                    positions: [
                        position,
                        Cesium.Cartesian3.add(
                            position,
                            Cesium.Cartesian3.multiplyByScalar(
                                rayInfo.direction,
                                500, // 射线长度
                                new Cesium.Cartesian3()
                            ),
                            new Cesium.Cartesian3()
                        )
                    ],
                    width: rayInfo.isCenterRay ? 3 : 2,
                    material: rayInfo.isCenterRay ?
                        new Cesium.PolylineOutlineMaterialProperty({
                            color: Cesium.Color.RED,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 1
                        }) :
                        new Cesium.PolylineGlowMaterialProperty({
                            color: Cesium.Color.BLUE.withAlpha(0.7),
                            glowPower: 0.1
                        })
                }
            });
        }
    });

    // 计算平均高度
    if (validHeights.length > 0) {
        const sum = validHeights.reduce((acc, height) => acc + height, 0);
        const averageHeight = sum / validHeights.length;

        console.log(`📈 检测到 ${validHeights.length} 个有效点，平均高度: ${averageHeight.toFixed(2)} 米`);
        console.log(`📊 所有有效高度: [${validHeights.map(h => h.toFixed(2)).join(', ')}]`);

        return averageHeight;
    } else {
        console.log("📉 未检测到有效的建筑物高度");
        // 如果没有检测到建筑物，返回地面高度或0
        const groundHeight = 0;
        return groundHeight;
    }
}

// 生成锥形分布的射线
export function generateConeRays(origin, rayCount = 12, coneAngle = 30) {
    const rays = [];

    // 获取局部坐标系的"下"方向
    const localDown = getLocalDownDirection(origin);

    // 获取局部坐标系的变换矩阵
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    const inverseEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());

    if (rayCount === 1) {
        // 只生成一个垂直向下的射线
        rays.push({
            direction: localDown,
            isCenterRay: true
        });
        return rays;
    }

    // 生成锥形射线
    for (let i = 0; i < rayCount; i++) {
        if (i === 0) {
            // 中心射线：垂直向下
            rays.push({
                direction: localDown,
                horizontalAngle: 0,
                verticalAngle: 0,
                isCenterRay: true
            });
        } else {
            // 锥形周围的射线
            const surroundingRays = rayCount - 1;
            const index = i - 1;

            const horizontalAngle = (index / surroundingRays) * 2 * Math.PI;
            const coneAngleRad = Cesium.Math.toRadians(coneAngle);

            // 在局部ENU坐标系中计算方向
            const x = Math.sin(coneAngleRad) * Math.cos(horizontalAngle); // 东向分量
            const y = Math.sin(coneAngleRad) * Math.sin(horizontalAngle); // 北向分量
            const z = -Math.cos(coneAngleRad); // 下向分量（负号表示向下）

            // 转换到世界坐标系
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

// 局部向下方向
export function getLocalDownDirection(position) {
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const downDirection = new Cesium.Cartesian3();
    Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, new Cesium.Cartesian3(0, 0, -1), downDirection);
    return Cesium.Cartesian3.normalize(downDirection, new Cesium.Cartesian3());
}