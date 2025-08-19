// 原始建筑数据字符串数组
const buildingWkts = [
    "MULTIPOLYGON(((119.9397666 30.2666361,119.9397978 30.2666361,119.9398290 30.2666361,119.9398914 30.2666092,119.9398914 30.2665822,119.9398914 30.2665553,119.9398602 30.2665553,119.9398290 30.2665553,119.9397978 30.2665553,119.9397666 30.2665822,119.9397354 30.2666092,119.9397354 30.2666361,119.9397666 30.2666361)))",
    "MULTIPOLYGON(((119.9397354 30.2756642,119.9397354 30.2756912,119.9397354 30.2757181,119.9397666 30.2757451,119.9398602 30.2757720,119.9398914 30.2757720,119.9399226 30.2756642,119.9399226 30.2756373,119.9398914 30.2756103,119.9398602 30.2756103,119.9398290 30.2756103,119.9397978 30.2756103,119.9397666 30.2756103,119.9397354 30.2756103,119.9397354 30.2756373,119.9397354 30.2756642)))",
    // 其它建筑数据...
];

// 随机生成无人机数据
function generateDroneTestData(buildingWkts, numDrones = 20) {
    const drones = [];

    // 解析每个建筑的中心点
    const centers = buildingWkts.map(wkt => {
        const match = wkt.match(/\(\(\((.+)\)\)\)/);
        if (!match) return null;
        const coords = match[1].split(',').map(s => s.trim().split(' ').map(Number));
        let sumLng = 0, sumLat = 0;
        coords.forEach(([lng, lat]) => { sumLng += lng; sumLat += lat; });
        return { lng: sumLng / coords.length, lat: sumLat / coords.length };
    }).filter(c => c !== null);

    // 随机生成无人机点
    for (let i = 0; i < numDrones; i++) {
        // 从建筑中心随机抖动经纬度
        const center = centers[Math.floor(Math.random() * centers.length)];
        const lngOffset = (Math.random() - 0.5) * 0.001; // ±0.0005经度
        const latOffset = (Math.random() - 0.5) * 0.001; // ±0.0005纬度
        const height = 50 + Math.random() * 100; // 高度 50~150 米
        drones.push({
            lng: center.lng + lngOffset,
            lat: center.lat + latOffset,
            height
        });
    }

    return drones;
}

// 生成测试数据
const testDrones = generateDroneTestData(buildingWkts, 30);
console.log(testDrones);