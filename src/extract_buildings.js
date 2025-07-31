// main.js
import * as Cesium from 'cesium';

// 设置 Cesium 访问令牌
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k';

async function init() {
    const viewer = new Cesium.Viewer('cesiumContainer', {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        infoBox: false,
        selectionIndicator: false,
        skyBox: undefined,
        skyAtmosphere: false
    });

    // 加载 3D Tileset
    const tileset = viewer.scene.primitives.add(
        await Cesium.Cesium3DTileset.fromUrl("http://192.168.4.78:8000/tileset.json", {
            debugShowBoundingVolume: true,
        })
    );

    tileset.loadProgress.addEventListener((numberOfPendingRequests) => {
        // console.log(`正在加载: ${numberOfPendingRequests} 个请求`);
    });

    viewer.scene.primitives.add(tileset);
    viewer.zoomTo(tileset);

    let clickedPosition = null;

    // 点击事件：选择中心点
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
        const ray = viewer.camera.getPickRay(movement.position);
        const position = viewer.scene.globe.pick(ray, viewer.scene);

        if (position) {
            const carto = Cesium.Cartographic.fromCartesian(position);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            const lat = Cesium.Math.toDegrees(carto.latitude);

            clickedPosition = [lon, lat];

            // 可视化点击点
            viewer.entities.add({
                position: position,
                point: {
                    pixelSize: 8,
                    color: Cesium.Color.RED,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2
                },
                label: {
                    text: '采样中心',
                    font: '14px sans-serif',
                    horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(10, 0)
                }
            });

            console.log(`✅ 已点击位置：经度 ${lon.toFixed(6)}, 纬度 ${lat.toFixed(6)}`);
            document.getElementById('status').innerText = `已选择中心点：${lon.toFixed(6)}, ${lat.toFixed(6)}。点击【提取建筑】开始分析。`;
        } else {
            console.log('❌ 未点击到地面');
            document.getElementById('status').innerText = '未点击到地面，请点击地形表面。';
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 提取按钮
    document.getElementById('extractBtn').onclick = async () => {
        if (!clickedPosition) {
            document.getElementById('status').innerText = '❌ 请先在地图上点击选择一个位置！';
            return;
        }

        const [centerLon, centerLat] = clickedPosition;

        // 设置采样范围（±10米）
        const radiusMeters = 200.0;
        const { west, east, south, north } = getRectAroundPoint(centerLon, centerLat, radiusMeters);

        const status = document.getElementById('status');
        status.innerText = '正在发射射线...';

        const buildings = await extractBuildingsByRayCasting(viewer, {
            west, south, east, north,
            sampleSpacing: 5.0,     // 每 5 米采样一次
            minHeight: 30.0,
            minArea: 100
        });

        status.innerText = `✅ 提取完成：${buildings.length} 栋建筑`;

        // 可视化建筑
        for (const building of buildings) {
            viewer.entities.add({
                name: `建筑 (${building.topHeight.toFixed(1)}m)`,
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray(building.footprint.flat()),
                    height: 0,
                    extrudedHeight: building.topHeight + 5,
                    material: Cesium.Color.BLUE.withAlpha(0.8),
                    outline: true,
                    outlineColor: Cesium.Color.YELLOW,
                    outlineWidth: 3
                },
                label: {
                    text: `H: ${building.topHeight.toFixed(1)}m`,
                    font: '12px sans-serif',
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
                }
            });
        }
    };
}
init();

// 工具函数：根据中心点和半径（米）生成矩形范围
function getRectAroundPoint(centerLon, centerLat, radiusMeters) {
    const latRad = Cesium.Math.toRadians(centerLat);
    const metersPerDegreeLat = 111319;
    const metersPerDegreeLng = 111319 * Math.cos(latRad);

    const radiusLatDegrees = radiusMeters / metersPerDegreeLat;
    const radiusLngDegrees = radiusMeters / metersPerDegreeLng;

    return {
        west: centerLon - radiusLngDegrees,
        east: centerLon + radiusLngDegrees,
        south: centerLat - radiusLatDegrees,
        north: centerLat + radiusLatDegrees
    };
}

// 建筑提取函数（修正版）
async function extractBuildingsByRayCasting(viewer, options = {}) {
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

    // 局部向下方向
    function getLocalDownDirection(position) {
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
        const downDirection = new Cesium.Cartesian3();
        Cesium.Matrix4.multiplyByPointAsVector(enuMatrix, new Cesium.Cartesian3(0, 0, -1), downDirection);
        return Cesium.Cartesian3.normalize(downDirection, new Cesium.Cartesian3());
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 采样循环
    for (let i = 0; i < lonCount; i++) {
        for (let j = 0; j < latCount; j++) {
            const lon = west + (i + 0.5) * lngStepDegrees;
            const lat = south + (j + 0.5) * latStepDegrees;

            console.log(`[第 ${total + 1} 个] 发射射线：经度 ${lon.toFixed(6)}, 纬度 ${lat.toFixed(6)}`);

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
            // const color = hitResult ? Cesium.Color.LIMEGREEN : Cesium.Color.RED;
            // viewer.entities.add({
            //     polyline: {
            //         positions: [position, hitResult ? hitResult.position : endPoint],
            //         width: 2,
            //         material: new Cesium.PolylineGlowMaterialProperty({
            //             glowPower: 0.2,
            //             color: color.withAlpha(0.8)
            //         })
            //     }
            // });

            if (hitResult) {
                const carto = Cesium.Cartographic.fromCartesian(hitResult.position);
                const hitLon = Cesium.Math.toDegrees(carto.longitude);
                const hitLat = Cesium.Math.toDegrees(carto.latitude);
                const height = carto.height;

                console.log(`📍 碰撞点：经度=${hitLon.toFixed(6)}, 纬度=${hitLat.toFixed(6)}, 高度=${height.toFixed(2)}m`);
                if (height >= minHeight) {
                    console.log(`✅ 符合高度要求：${height.toFixed(2)}m >= ${minHeight}m`);
                    hits.push([hitLon, hitLat]);
                } else {
                    console.log(`❌ 不符合高度要求：${height.toFixed(2)}m < ${minHeight}m`);
                }

            }

            total++;

            // await sleep(delayMs); // 可取消注释用于降速调试
        }
    }

    console.log(`✅ 射线发射完成：共 ${total} 个点，命中 ${hits.length} 个`);

    for (let i = 0; i < hits.length - 1; i++) {
        const from = turf.point(hits[i]);
        const to = turf.point(hits[i + 1]);
        const d = turf.distance(from, to, { units: 'meters' });
        console.log(`点 ${i} 到 ${i + 1} 的距离: ${d.toFixed(2)} m`);
    }



    if (hits.length === 0) return [];

    // 聚类与建筑提取（保持不变）
    const points = turf.points(hits);
    // 把 8 米转换为“度”
    const clusteringDistanceDegrees = 10 / metersPerDegreeLng;
    //const clustered = turf.clustersDbscan(points, clusteringDistanceDegrees, { minPoints: 5 });
    const clustered = turf.clustersDbscan(points, 10, { units: 'meters', minPoints: 5 });

    const buildings = [];

    // 过滤有效聚类
    const features = clustered.features.filter(f => f.properties.cluster !== -1);
    const clusterIds = [...new Set(features.map(f => f.properties.cluster))];

    console.log(`🔍 发现 ${clusterIds.length} 个有效聚类 (cluster IDs: ${clusterIds.join(', ')})`);

    for (const cluster of clusterIds) {
        const clusterPoints = features
            .filter(f => f.properties.cluster === cluster)
            .map(f => f.geometry.coordinates);

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
        let poly;
        try {
            poly = turf.convex(turf.points(clusterPoints));
        } catch (e) {
            console.warn(`  ❌ 聚类 ${cluster} 生成凸包失败:`, e.message);
            continue;
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
        const footprint = poly.geometry.coordinates[0]; // [ [x,y], ... ]

        // 获取建筑高度（从中心点向下射线）
        const testPoint = Cesium.Cartesian3.fromDegrees(
            center.geometry.coordinates[0],
            center.geometry.coordinates[1],
            flyingHeight
        );
        const result = scene.pickFromRay(
            new Cesium.Ray(testPoint, getLocalDownDirection(testPoint))
        );
        const topHeight = result
            ? Cesium.Cartographic.fromCartesian(result.position).height
            : 10;

        console.log(`  🏢 识别为建筑：高度 ${topHeight.toFixed(1)}m，面积 ${area.toFixed(1)}㎡`);

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