<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import { onMounted } from "vue";
import * as Cesium from "cesium";
let viewer;

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1OGIzZmQyZC03YjNiLTQzMjQtOWQxYS0xOTYxZWUyMTYzMjQiLCJpZCI6MzEzMjQxLCJpYXQiOjE3NTAyMjc2NDd9.G9X0WofFDt3mbp2L_WDzU__rcAVg0v3rpAliG1sgB9k';
const cesiumConfig = {
  // 主页按钮
  homeButton: false,
  // 场景模式选择器
  sceneModePicker: false,
  // 全屏按钮
  fullscreenButton: false,
  // 是否显示点击要素之后显示的信息
  infoBox: false,
  // 要素选中框
  selectionIndicator: false,
  // 影像切换
  baseLayerPicker: false,
  // 启用了阴影效果
  shadows: true,
  // 启用动画
  shouldAnimate: true,
  // 是否显示动画控件
  animation: false,
  // 是否显示时间线控件
  timeline: false,
  // 是否显示地名查找控件
  geocoder: false,
  // 是否显示帮助信息控件
  navigationHelpButton: false,
  contextOptions: {
    contextType: 2, // Webgl2:2 ; WebGPU:3
  },
  // 版权信息
  creditContainer: document.createElement('div')
}
const initMap = () => {
  viewer = new Cesium.Viewer('cesiumContainer', cesiumConfig)
}
onMounted(() => {
  initMap();
})
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <HelloWorld msg="Vite + Vue" />
  <div class="cesium" id="cesiumContainer" style="width: 100%;height: 100vh;"></div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
