// main.js
import * as Cesium from "cesium";
import {
  calculateBuildingsHeight,
  getLocalDownDirection,
  extractBuildingsByRayCasting,
  saveToFile,
} from "./ray_height_new.js";

// 设置 Cesium 访问令牌
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k";

async function init() {
  const viewer = new Cesium.Viewer("cesiumContainer", {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    infoBox: false,
    selectionIndicator: false,
    skyBox: undefined,
    skyAtmosphere: false,
  });

  // 加载 3D Tileset
  const tileset = viewer.scene.primitives.add(
    await Cesium.Cesium3DTileset.fromUrl(
      "https://gl.hangzhoudk.com/modelfile/tileset.json",
      {
        debugShowBoundingVolume: false,
      }
    )
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
          outlineWidth: 2,
        },
        label: {
          text: "采样中心",
          font: "14px sans-serif",
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(10, 0),
        },
      });

      console.log(
        `✅ 已点击位置：经度 ${lon.toFixed(6)}, 纬度 ${lat.toFixed(6)}`
      );
      document.getElementById(
        "status"
      ).innerText = `已选择中心点：${lon.toFixed(6)}, ${lat.toFixed(
        6
      )}。点击【提取建筑】开始分析。`;
    } else {
      console.log("❌ 未点击到地面");
      document.getElementById("status").innerText =
        "未点击到地面，请点击地形表面。";
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // 提取按钮
  document.getElementById("extractBtn").onclick = async () => {
    if (!clickedPosition) {
      document.getElementById("status").innerText =
        "❌ 请先在地图上点击选择一个位置！";
      return;
    }

    const [centerLon, centerLat] = clickedPosition;

    // 设置采样范围（±10米）
    const radiusMeters = 100.0;
    // const west = 119.99733369870195;  // 西经
    // const east = 120.00149483788569;  // 东经
    // const south = 30.282700396835303;  // 南纬
    // const north = 30.286293673814072;  // 北纬
    const { west, east, south, north } = getRectAroundPoint(
      centerLon,
      centerLat,
      radiusMeters
    );

    console.log(
      `🌍 采样范围：经度 [${west.toFixed(6)} ~ ${east.toFixed(
        6
      )}]，纬度 [${south.toFixed(6)} ~ ${north.toFixed(6)}]`
    );
    console.log(
      `🌍 采样范围：经度 [${west} ~ ${east}]，纬度 [${south} ~ ${north}]`
    );
    const status = document.getElementById("status");
    status.innerText = "正在发射射线...";

    const buildings = await extractBuildingsByRayCasting(viewer, {
      west,
      south,
      east,
      north,
      sampleSpacing: 3.0, // 每 5 米采样一次
      minHeight: 100.0,
      maxHeight: 500.0,
      minArea: 30,
    });

    status.innerText = `✅ 提取完成：${buildings.length} 栋建筑`;

    let fileContent = ""; // 用于存储文件内容

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
      console.log(
        `🎨 建筑footprint WKT格式:${wktString}` + `,高度:${building.topHeight}`
      );
      // 添加到文件内容中
      fileContent += `"${wktString}","${building.topHeight.toFixed(2)}"\n`;
      viewer.entities.add({
        name: `建筑 (${building.topHeight.toFixed(1)}m)`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(
            building.footprint.flat()
          ),
          height: 0,
          extrudedHeight: building.topHeight,
          material: Cesium.Color.BLUE.withAlpha(0.8),
          outline: true,
          outlineColor: Cesium.Color.YELLOW,
          outlineWidth: 3,
        },
        label: {
          text: `H: ${building.topHeight.toFixed(1)}m`,
          font: "12px sans-serif",
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        },
      });
    }

    // 执行保存
    saveToFile(fileContent, "buildings_output.txt");
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
    north: centerLat + radiusLatDegrees,
  };
}

// 建筑提取函数（修正版）
