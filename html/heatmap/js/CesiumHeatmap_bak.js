export default class CesiumHeatmap {
    /**
     * @param options.viewer 已初始化的 Cesium Viewer（必填）
     * @param options.tileset 可选 Tileset 实例，如果传入则使用已有 Tileset，否则热力图库不负责加载 Tileset
     * @param options.heatmapContainerId 热力图容器ID
     * @param options.dataFile 建筑数据文件路径（可选，如果传入 buildings 数据可忽略）
     * @param options.radius 热力图点半径
     * @param options.type 'building' 或 'drone'，决定渲染类型（默认 building）
     */
    constructor(options) {
        if (!options.viewer) throw new Error('Cesium Viewer 实例必须传入');
        this.viewer = options.viewer;
        this.tileset = options.tileset || null;
        this.heatmapContainerId = options.heatmapContainerId;
        this.dataFile = options.dataFile;
        this.radius = options.radius || 50;
        this.type = options.type || 'building'; // 新增 type 参数

        this.heatmapInstance = null;
        this.buildings = [];
        this.drones = [];
        this.heatmapData = [];
        this.lastUpdate = 0;
    }

    async init() {
        const container = document.getElementById(this.heatmapContainerId);
        if (!container) throw new Error('热力图容器未找到');
        this.heatmapInstance = h337.create({
            container,
            radius: this.radius,
            maxOpacity: 0.8,
            minOpacity: 0.3,
            blur: 0.85,
            gradient: { '0.1': 'blue', '0.3': 'cyan', '0.5': 'lime', '0.7': 'yellow', '1.0': 'red' }
        });

        // 如果是建筑物类型并且提供数据文件，则加载建筑物
        if (this.type === 'building' && this.dataFile) {
            await this.loadBuildings();
        }

        // 绑定渲染更新
        this.viewer.scene.postRender.addEventListener(() => this.updateHeatmap());
        window.addEventListener('resize', () => this.updateHeatmap());
    }

    // ========== 建筑物数据加载 ==========
    async loadBuildings() {
        const resp = await fetch(this.dataFile);
        const text = await resp.text();
        const lines = text.trim().split('\n');

        function parseCenter(wkt) {
            const match = wkt.match(/\(\(\((.+)\)\)\)/);
            if (!match) return null;
            const coords = match[1].split(',').map(s => s.trim().split(' ').map(Number));
            let sumLng = 0, sumLat = 0;
            coords.forEach(([lng, lat]) => { sumLng += lng; sumLat += lat; });
            return { lng: sumLng / coords.length, lat: sumLat / coords.length };
        }

        this.buildings = lines.map(line => {
            const parts = line.split('","');
            const wkt = parts[0].replace(/^"/, '');
            const value = parseFloat(parts[1].replace(/"$/, ''));
            const center = parseCenter(wkt);
            if (center) return { lng: center.lng, lat: center.lat, occupants: value };
            return null;
        }).filter(b => b !== null);

        this.heatmapData = this.generateHeatmapFromBuildings(this.buildings);
    }

    generateHeatmapFromBuildings(buildings) {
        const maxOcc = Math.max(...buildings.map(b => b.occupants));
        return buildings.map(b => ({
            lng: b.lng,
            lat: b.lat,
            value: Math.floor(b.occupants / maxOcc * 100)
        }));
    }

    // ========== 新增无人机数据 ==========
    setDroneData(drones) {
        this.type = 'drone';
        this.drones = drones; // drones: [{lng, lat, height}]
        this.heatmapData = this.generateDroneHeatmap(drones);
        this.updateHeatmap();
    }

    generateDroneHeatmap(drones) {
        if (!drones || drones.length === 0) return [];
        const maxHeight = Math.max(...drones.map(d => d.height));
        return drones.map(d => ({
            lng: d.lng,
            lat: d.lat,
            value: Math.floor(d.height / maxHeight * 100)
        }));
    }

    // ========== 更新热力图 ==========
    updateHeatmap() {
        const now = performance.now();
        if (now - this.lastUpdate < 50) return; // 节流
        this.lastUpdate = now;

        const data = { max: 100, min: 0, data: [] };
        this.heatmapData.forEach(point => {
            const pos = Cesium.Cartesian3.fromDegrees(point.lng, point.lat);
            const pixel = this.viewer.scene.cartesianToCanvasCoordinates(pos);
            if (pixel && isFinite(pixel.x) && isFinite(pixel.y))
                data.data.push({ x: Math.floor(pixel.x), y: Math.floor(pixel.y), value: point.value });
        });

        this.heatmapInstance._renderer.setDimensions(this.viewer.canvas.clientWidth, this.viewer.canvas.clientHeight);
        this.heatmapInstance.setData(data);
    }

    // 动态修改半径
    setRadius(radius) {
        const container = document.getElementById(this.heatmapContainerId);
        container.innerHTML = '';
        this.heatmapInstance = h337.create({
            container,
            radius,
            maxOpacity: 0.8,
            minOpacity: 0.3,
            blur: 0.85,
            gradient: { '0.1': 'blue', '0.3': 'cyan', '0.5': 'lime', '0.7': 'yellow', '1.0': 'red' }
        });
        this.updateHeatmap();
    }
}
