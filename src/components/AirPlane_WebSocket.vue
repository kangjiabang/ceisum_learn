<!-- src/components/CesiumViewer.vue -->
<script setup>
import { onMounted, onBeforeUnmount } from "vue";
import * as Cesium from "cesium";

let viewer;
let positionProperty;
let flightData = [];
let ws;
const timeStepInSeconds = 30;

const initMap = async () => {
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k';

    viewer = new Cesium.Viewer('cesiumContainer', {
        terrain: Cesium.Terrain.fromWorldTerrain(),
    });

    const osmBuildings = await Cesium.createOsmBuildingsAsync();
    viewer.scene.primitives.add(osmBuildings);

    // Initialize position property for the aircraft
    positionProperty = new Cesium.SampledPositionProperty();

    // Initialize clock with default values (will be updated with real data)
    const defaultStart = Cesium.JulianDate.fromIso8601("2020-03-09T23:10:00Z");
    const defaultStop = Cesium.JulianDate.addSeconds(defaultStart, 60, new Cesium.JulianDate());
    viewer.clock.startTime = defaultStart.clone();
    viewer.clock.stopTime = defaultStop.clone();
    viewer.clock.currentTime = defaultStart.clone();
    viewer.clock.multiplier = 10;
    viewer.clock.shouldAnimate = true;

    // Load airplane model
    await loadModel();
};

const loadModel = async () => {
    // 设置起始和终止时间
    const airplaneUri = await Cesium.IonResource.fromAssetId(3472138);
    const airplaneEntity = viewer.entities.add({
        position: positionProperty,
        model: { uri: airplaneUri },
        orientation: new Cesium.VelocityOrientationProperty(positionProperty),
        path: {
            resolution: 1,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.1,
                color: Cesium.Color.YELLOW
            }),
            width: 5,
            leadTime: 0,
            trailTime: 300 // 显示过去5分钟的航迹
        }
    });
    viewer.trackedEntity = airplaneEntity;
};

const setupWebSocket = () => {
    // Replace with your WebSocket server URL
    ws = new WebSocket('ws://localhost:3000/ws/flight-data');

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const newData = JSON.parse(event.data);

        // Process new data point
        processFlightData(newData);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
    };
};

const processFlightData = (dataPoint) => {
    console.log('Received flight data:', dataPoint);
    // Add new data point to flightData array
    flightData.push(dataPoint);

    // Calculate time for this sample
    const start = viewer.clock.startTime;
    const time = Cesium.JulianDate.addSeconds(
        start,
        (flightData.length - 1) * timeStepInSeconds,
        new Cesium.JulianDate()
    );

    // Convert to Cartesian position
    const position = Cesium.Cartesian3.fromDegrees(
        dataPoint.longitude,
        dataPoint.latitude,
        dataPoint.height
    );

    // Add sample to position property
    positionProperty.addSample(time, position);

    // Update flight path visualization
    viewer.entities.add({
        description: `Location: (${dataPoint.longitude}, ${dataPoint.latitude}, ${dataPoint.height})`,
        position: position,
        point: { pixelSize: 5, color: Cesium.Color.RED }
    });

    // Update clock stop time
    const totalSeconds = timeStepInSeconds * (flightData.length - 1);
    const newStop = Cesium.JulianDate.addSeconds(
        start,
        totalSeconds,
        new Cesium.JulianDate()
    );
    viewer.clock.stopTime = newStop.clone();
    viewer.timeline.zoomTo(start, newStop);
};

onMounted(() => {
    initMap().then(() => {
        setupWebSocket();
    });
});

onBeforeUnmount(() => {
    if (ws) {
        ws.close();
    }
    if (viewer) {
        viewer.destroy();
    }
});
</script>

<template>
    <div id="cesiumContainer" style="width: 100%; height: 100vh;"></div>
</template>

<style scoped>
#cesiumContainer {
    width: 100%;
    height: 100vh;
}
</style>