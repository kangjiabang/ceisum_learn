export async function extractBuildingsByRayCasting(viewer, options = {}) {
    const {
        west, south, east, north,
        sampleSpacing = 5.0,
        minHeight = 20.0,
        minArea = 20,
        flyingHeight = 500,
        delayMs = 0 // 可设为 50-100 调试用
    } = options;

    const scene = viewer.scene;
    const hits = [];
    let total = 0;

    // 计算中心纬度用于经度缩放
    const centerLat = (north + south) / 2;
    const latRad = Cesium.Math.toRadians(centerLat);
    const metersPerDegreeLat = 111319;
    const metersPerDegreeLng = 111319 * Math.cos(latRad);

    // 将米转换为经纬度（度）
    const latStepDegrees = sampleSpacing / metersPerDegreeLat;
    const lngStepDegrees = sampleSpacing / metersPerDegreeLng;

    // 计算网格数量
    const lonCount = Math.ceil((east - west) / lngStepDegrees);
    const latCount = Math.ceil((north - south) / latStepDegrees);

    console.log(`🌍 采样区域：经度 [${west.toFixed(6)} ~ ${east.toFixed(6)}]，纬度 [${south.toFixed(6)} ~ ${north.toFixed(6)}]`);
    console.log(`📏 采样间距：经度方向 ${lngStepDegrees.toFixed(8)}°（≈${sampleSpacing}米），纬度方向 ${latStepDegrees.toFixed(8)}°（≈${sampleSpacing}米）`);
    console.log(`🧩 网格大小：${lonCount} × ${latCount} = ${lonCount * latCount} 个采样点`);

    // 验证实际距离（可选）
    const testP1 = Cesium.Cartesian3.fromDegrees(west, south);
    const testP2 = Cesium.Cartesian3.fromDegrees(west + lngStepDegrees, south);
    const actualDistance = Cesium.Cartesian3.distance(testP1, testP2);
    console.log(`✅ 实际采样间距验证：${actualDistance.toFixed(2)} 米`);

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 采样循环
    for (let i = 0; i < lonCount; i++) {
        for (let j = 0; j < latCount; j++) {
            const lon = west + (i + 0.5) * lngStepDegrees;
            const lat = south + (j + 0.5) * latStepDegrees;

            //console.log(`[第 ${total + 1} 个] 发射射线：经度 ${lon.toFixed(6)}, 纬度 ${lat.toFixed(6)}`);
            if (total % 1000 === 0) {
                console.log(`[第 ${total + 1} 个] 发射射线：经度 ${lon.toFixed(6)}, 纬度 ${lat.toFixed(6)}`);
            }


            const position = Cesium.Cartesian3.fromDegrees(lon, lat, flyingHeight);
            const direction = getLocalDownDirection(position);
            const ray = new Cesium.Ray(position, direction);

            const endPoint = Cesium.Cartesian3.add(
                position,
                Cesium.Cartesian3.multiplyByScalar(direction, 1000, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            );

            let hitResult = null;
            try {
                hitResult = scene.pickFromRay(ray);
            } catch (e) {
                console.warn(`射线检测失败: ${lon}, ${lat}`, e);
            }

            //可视化射线（可选，调试用）
            //showRayPoint(hitResult, position, endPoint);

            if (hitResult) {
                const carto = Cesium.Cartographic.fromCartesian(hitResult.position);
                const hitLon = Cesium.Math.toDegrees(carto.longitude);
                const hitLat = Cesium.Math.toDegrees(carto.latitude);
                const height = carto.height;
                //console.log(`📍 碰撞点：经度=${hitLon.toFixed(6)}, 纬度=${hitLat.toFixed(6)}, 高度=${height.toFixed(2)}m`);
                if (height >= minHeight) {
                    //console.log(`✅ 符合高度要求：${height.toFixed(2)}m >= ${minHeight}m`);
                    hits.push([hitLon, hitLat]);
                } else {
                    //console.log(`❌ 不符合高度要求：${height.toFixed(2)}m < ${minHeight}m`);
                }

            }

            total++;

            // await sleep(delayMs); // 可取消注释用于降速调试
        }
    }

    console.log(`✅ 射线发射完成：共 ${total} 个点，命中 ${hits.length} 个`);

    //调试点与点之间距离
    // for (let i = 0; i < hits.length - 1; i++) {
    //     const from = turf.point(hits[i]);
    //     const to = turf.point(hits[i + 1]);
    //     const d = turf.distance(from, to, { units: 'meters' });
    //     console.log(`点 ${i} 到 ${i + 1} 的距离: ${d.toFixed(2)} m`);
    // }



    if (hits.length === 0) return [];

    // 保存所有命中点到文件
    const hitLines = hits.map(([lon, lat]) => `${lon},${lat}`).join('\n');
    saveToFile(hitLines, 'hits.csv');

    // 每10000个点进行一次建筑提取
    const batchSize = 10000;
    const allBuildings = [];

    for (let i = 0; i < hits.length; i += batchSize) {
        const batch = hits.slice(i, i + batchSize);
        console.log(`🚀 处理第 ${(i / batchSize) + 1} 批：${batch.length} 个点`);

        const buildings = await getBuildingsByTurf(batch);
        allBuildings.push(...buildings);
    }

    console.log(`\n✅ 所有建筑提取完毕，总计 ${allBuildings.length} 栋`);

    return allBuildings;

    async function getBuildingsByTurf(hits) {
        const points = turf.points(hits);

        // 把 8 米转换为“度”
        //const clustered = turf.clustersDbscan(points, clusteringDistanceDegrees, { minPoints: 5 });
        const clustered = turf.clustersDbscan(points, 8, { units: 'meters', minPoints: 10 });

        const buildings = [];

        // 过滤有效聚类
        const features = clustered.features.filter(f => f.properties.cluster !== -1);
        const clusterIds = [...new Set(features.map(f => f.properties.cluster))]
            .filter(id => typeof id === 'number' && id !== -1); // 确保是有效数字

        console.log(`🔍 发现 ${clusterIds.length} 个有效聚类 (cluster IDs: ${clusterIds.join(', ')})`);

        for (const cluster of clusterIds) {

            const clusterPoints = features
                .filter(f => f.properties.cluster === cluster)
                .map(f => f.geometry.coordinates);

            // const clusterPoints = features
            // .map(f => {
            //     const coords = f.geometry.coordinates;
            //     if (!Array.isArray(coords) || coords.length < 2 || typeof coords[0] !== 'number') {
            //         return null;
            //     }
            //     return [coords[0], coords[1]]; // 显式提取 [lon, lat]
            // })
            // .filter(Boolean);
            const colorMap = [
                Cesium.Color.RED, Cesium.Color.BLUE, Cesium.Color.GREEN, Cesium.Color.YELLOW, Cesium.Color.PURPLE
            ];
            // 可视化聚类点
            // for (const f of clustered.features) {
            //     const [lon, lat] = f.geometry.coordinates;
            //     const clusterId = f.properties.cluster;
            //     const color = colorMap[clusterId % colorMap.length];
            //     viewer.entities.add({
            //         position: Cesium.Cartesian3.fromDegrees(lon, lat),
            //         point: {
            //             pixelSize: 6,
            //             color: Cesium.Color.BLUE.withAlpha(0.7),
            //             outlineColor: Cesium.Color.WHITE,
            //             outlineWidth: 1
            //         }
            //     });
            // }
            console.log(`\n🔍 处理聚类 [${cluster}]：${clusterPoints.length} 个命中点`);

            // 检查点数
            if (clusterPoints.length < 4) {
                console.log(`  ⚠️ 跳过：点数不足 4`);
                continue;
            }

            // 生成凸包
            // let poly;
            // try {
            //     poly = turf.convex(turf.points(clusterPoints));
            // } catch (e) {
            //     console.warn(`  ❌ 聚类 ${cluster} 生成凸包失败:`, e.message);
            //     continue;
            // }
            let poly = turf.concave(turf.points(clusterPoints), { maxEdge: 0.05 }); // ≈50 米
            if (!poly) {
                console.warn(`  ❌ 聚类 ${cluster} 凹包生成失败，回退到凸包`);
                poly = turf.convex(turf.points(clusterPoints));
            }

            const area = turf.area(poly);
            console.log(`  📏 凸包面积: ${area.toFixed(2)} 平方米`);

            // 检查面积
            if (area < minArea) {
                console.log(`  ⚠️ 跳过：面积 ${area.toFixed(2)} < ${minArea}`);
                continue;
            }

            // 获取建筑中心和轮廓
            const center = turf.center(poly);
            // const footprint = poly.geometry.coordinates[0]; // [ [x,y], ... ]
            // // 获取建筑高度（从中心点向下射线）
            // const testPoint = Cesium.Cartesian3.fromDegrees(
            //     center.geometry.coordinates[0],
            //     center.geometry.coordinates[1],
            //     flyingHeight
            // );
            // 获取建筑轮廓
            const footprint = poly.geometry.coordinates[0]; // [ [lon, lat], ... ]


            // 从 footprint 中取四个等间距点（可自定义数量）
            const samplePoints = [];
            const len = footprint.length;
            for (let i = 0; i < 4; i++) {
                const idx = Math.floor(i * len / 4); // 四等分
                samplePoints.push(footprint[idx]);
            }

            // 对四个点分别计算高度
            let topHeight = 0;
            for (const [lon, lat] of samplePoints) {
                const testPoint = Cesium.Cartesian3.fromDegrees(lon, lat, flyingHeight);
                const height = await calculateBuildingsHeight(viewer, testPoint);
                topHeight = Math.max(topHeight, height);
            }

            console.log(`  🏢 识别为建筑：高度 ${topHeight.toFixed(2)}m，面积 ${area.toFixed(2)}㎡`);

            buildings.push({
                footprint,
                topHeight,
                area,
                center: center.geometry.coordinates
            });
        }

        console.log(`\n✅ 最终提取到 ${buildings.length} 栋独立建筑`);
        console.log(buildings.map(b => ({
            center: b.center,
            footprint: b.footprint,
            topHeight: b.topHeight.toFixed(2),
            area: b.area.toFixed(2)
        })));

        return buildings;
    }
}



function showRayPoint(hitResult, position, endPoint) {
    const color = hitResult ? Cesium.Color.LIMEGREEN : Cesium.Color.RED;
    viewer.entities.add({
        polyline: {
            positions: [position, hitResult ? hitResult.position : endPoint],
            width: 2,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: color.withAlpha(0.8)
            })
        }
    });
}
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


            // console.log(
            //     `📍 射线${rayIndex}碰撞点: 经度=${Cesium.Math.toDegrees(cartographicHit.longitude).toFixed(6)}, ` +
            //     `纬度=${Cesium.Math.toDegrees(cartographicHit.latitude).toFixed(6)}, ` +
            //     `碰撞点高度=${cartographicHit.height.toFixed(2)}米, ` +
            //     `建筑物高度=${buildingHeight.toFixed(2)}米, ` +
            //     `距离=${distance.toFixed(2)}米`
            // );
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

        //console.log(`📈 检测到 ${validHeights.length} 个有效点，平均高度: ${averageHeight.toFixed(2)} 米`);
        //console.log(`📊 所有有效高度: [${validHeights.map(h => h.toFixed(2)).join(', ')}]`);

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

// 保存到文件
export function saveToFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}