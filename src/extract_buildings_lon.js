// main.js
import * as Cesium from 'cesium';
import { calculateBuildingsHeight, getLocalDownDirection, extractBuildingsByRayCasting, saveToFile } from './ray_height.js';

// 设置 Cesium 访问令牌
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k';

// --- 新增：定义要扫描的经纬度范围 ---
// 请根据你的实际需求修改这些值
const SCAN_WEST = 119.9384401375432;  // 西经
const SCAN_EAST = 120.03013724921674;  // 东经
const SCAN_SOUTH = 30.261852568883025;  // 南纬
const SCAN_NORTH = 30.31701791606819;  // 北纬

const SCAN_SAMPLE_SPACING = 3.0; // 采样间距 (米)
const SCAN_MIN_HEIGHT = 20.0;    // 最小建筑高度 (米)
const SCAN_MIN_AREA = 100;       // 最小建筑面积 (平方米)

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

    // 提取按钮
    document.getElementById('extractBtn').onclick = async () => {

        const status = document.getElementById('status');
        status.innerText = '正在发射射线...';

        const buildings = await extractBuildingsByRayCasting(viewer, {
            west: SCAN_WEST,
            south: SCAN_SOUTH,
            east: SCAN_EAST,
            north: SCAN_NORTH,
            sampleSpacing: SCAN_SAMPLE_SPACING,
            minHeight: SCAN_MIN_HEIGHT,
            minArea: SCAN_MIN_AREA
        });

        status.innerText = `✅ 提取完成：${buildings.length} 栋建筑`;

        let fileContent = ''; // 用于存储文件内容

        // 可视化建筑
        for (const building of buildings) {
            // 将 footprint 转换为 WKT 格式的 MULTIPOLYGON 字符串
            const coordinates = building.footprint.flat();
            let wktString = "MULTIPOLYGON(((";

            // 遍历坐标点，每两个元素为一组经纬度
            for (let i = 0; i < coordinates.length; i += 2) {
                const longitude = coordinates[i].toFixed(7);
                const latitude = coordinates[i + 1].toFixed(7);
                wktString += `${longitude} ${latitude}`;

                // 如果不是最后一个点，添加逗号
                if (i < coordinates.length - 2) {
                    wktString += ",";
                }
            }

            wktString += ")))";
            console.log(`🎨 建筑footprint WKT格式:${wktString}` + `,高度:${building.topHeight}`);
            // 添加到文件内容中
            fileContent += `"${wktString}","${building.topHeight.toFixed(2)}"\n`;
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

        // 执行保存
        saveToFile(fileContent, 'buildings_output.txt');
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


