<!-- src/components/CesiumViewer.vue -->
<script setup lang="ts">
import { onMounted } from "vue";
import * as Cesium from "cesium";

let viewer: Cesium.Viewer;

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k'; // 你的完整 token

const cesiumConfig = {
    homeButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    shadows: true,
    shouldAnimate: true,
    animation: false,
    timeline: false,
    geocoder: false,
    navigationHelpButton: false,
    contextOptions: {
        contextType: 2,
    },
    creditContainer: document.createElement('div'),
};

const initMap = () => {
    viewer = new Cesium.Viewer("cesiumContainer", cesiumConfig);
};

onMounted(() => {
    initMap();
});
</script>

<template>
    <div class="cesium" id="cesiumContainer" style="width: 100%; height: 100vh;"></div>
</template>

<style scoped>
.cesium {
    width: 100%;
    height: 100vh;
}
</style>
