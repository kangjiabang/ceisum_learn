// import * as Cesium from 'cesium'
// import h337 from 'heatmap.js';

// window.h337 = h337;

export default class CesiumHeatmap {
    /**
     * @param options.viewer 已初始化的 Cesium Viewer（必填）
     * @param options.tileset 可选 Tileset 实例
     * @param options.heatmapContainerId 热力图容器ID
     * @param options.dataFile 建筑数据文件路径（可选）
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
        this.type = options.type || 'building';

        this.heatmapInstance = null;
        this.buildings = [];
        this.drones = [];
        this.heatmapData = [];
        this.lastUpdate = 0;
        // 移除 currentData 的预定义，每次创建新对象
    }

    async init() {
        this.createHeatmapInstance();

        // 如果是建筑物类型并且提供数据文件，则加载建筑物
        if (this.type === 'building' && this.dataFile) {
            await this.loadBuildings();
        }
        // 绑定渲染更新
        this.viewer.scene.postRender.addEventListener(() => this.updateHeatmap());

        // 监听 resize：销毁并重建 heatmap
        this.resizeHandler = () => {
            this.createHeatmapInstance();
            this.updateHeatmap();
        };
        window.addEventListener('resize', this.resizeHandler);

        console.log('CesiumHeatmap 初始化完成，类型:', this.type);
        // 初始化后立即渲染一次热力图，确保首次显示
        this.updateHeatmap();
    }

    // ========== 创建 heatmap 实例 ==========
    createHeatmapInstance() {
        const container = document.getElementById(this.heatmapContainerId);
        if (!container) throw new Error('热力图容器未找到');
        container.innerHTML = ''; // 清空旧内容

        // 创建新的容器元素
        const heatmapDiv = document.createElement('div');
        heatmapDiv.style.position = 'absolute';
        heatmapDiv.style.top = '0';
        heatmapDiv.style.left = '0';
        heatmapDiv.style.width = '100%';
        heatmapDiv.style.height = '100%';
        container.appendChild(heatmapDiv);

        this.heatmapInstance = h337.create({
            container: heatmapDiv,
            radius: this.radius,
            maxOpacity: 0.8,
            minOpacity: 0.3,
            blur: 0.85,
            gradient: {
                '0.1': 'blue',
                '0.3': 'cyan',
                '0.5': 'lime',
                '0.7': 'yellow',
                '1.0': 'red'
            }
        });
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

    // ========== 无人机数据 ==========
    setDroneData(drones) {
        this.type = 'drone';
        this.drones = drones;
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
        if (!this.heatmapInstance || !this.heatmapData.length) return;

        const now = performance.now();
        if (now - this.lastUpdate < 200) return; // 节流
        this.lastUpdate = now;
        // 每次创建新的数据数组，避免修改只读属性
        const heatmapDataPoints = [];

        this.heatmapData.forEach(point => {
            const pos = Cesium.Cartesian3.fromDegrees(point.lng, point.lat);
            const pixel = this.viewer.scene.cartesianToCanvasCoordinates(pos);
            if (pixel && isFinite(pixel.x) && isFinite(pixel.y) &&
                pixel.x >= 0 && pixel.y >= 0 &&
                pixel.x < this.viewer.canvas.clientWidth &&
                pixel.y < this.viewer.canvas.clientHeight
            ) {
                heatmapDataPoints.push({
                    x: Math.floor(pixel.x),
                    y: Math.floor(pixel.y),
                    value: point.value
                });
            }
        });
        //console.log('热力图点数据:', heatmapDataPoints);
        console.log('热力图点数:', heatmapDataPoints.length)

        // 创建完全新的数据对象
        if (heatmapDataPoints.length > 0) {
            try {
                // 使用全新的对象，确保没有共享引用
                const heatmapData = {
                    max: 100,
                    min: 0,
                    data: heatmapDataPoints
                };

                this.heatmapInstance.setData(heatmapData);
            } catch (e) {
                console.error('heatmap setData error:', e);
            }
        }
    }

    // 动态修改半径
    setRadius(radius) {
        this.radius = radius;
        this.createHeatmapInstance();
        this.updateHeatmap();
    }

    // 清理方法
    destroy() {
        if (this.heatmapInstance) {
            const container = document.getElementById(this.heatmapContainerId);
            if (container) {
                container.innerHTML = '';
            }
            this.heatmapInstance = null;
        }
        // 正确移除 resize 监听器
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }
}
export { CesiumHeatmap };