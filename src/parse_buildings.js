// src/parse_buildings.js
import * as turf from '@turf/turf';
import wellknown from 'wellknown';

export default async function parseBuildingsFile(filePath) {
    try {
        // 使用 fetch 替代 fs.readFileSync
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to load file: ${filePath} (${response.status})`);
        }

        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const polygons = [];

        lines.forEach((line, idx) => {
            // 处理格式: "POLYGON((...))","100" 或 "MULTIPOLYGON(...)", "50"
            const match = line.match(/"((?:MULTIPOLYGON|POLYGON)\(.*\))"\s*,\s*"?([\d.]+)"?/);
            if (!match) {
                console.warn(`Skipping invalid line ${idx + 1}: ${line}`);
                return;
            }

            const wkt = match[1].trim();
            const height = parseFloat(match[2]);

            if (isNaN(height)) {
                console.warn(`Invalid height in line ${idx + 1}: ${match[2]}`);
                return;
            }

            let geojson;
            try {
                geojson = wellknown.parse(wkt);
            } catch (err) {
                console.warn(`Invalid WKT in line ${idx + 1}: ${wkt}`);
                return;
            }

            let feature;
            if (geojson.type === 'Polygon') {
                feature = turf.polygon(geojson.coordinates, { id: idx, height, wkt });
            } else if (geojson.type === 'MultiPolygon') {
                feature = turf.multiPolygon(geojson.coordinates, { id: idx, height, wkt });
            } else {
                console.warn(`Unsupported geometry type: ${geojson.type}`);
                return;
            }

            polygons.push(feature);
        });

        console.log(`✅ 成功解析 ${polygons.length} 个建筑物`);
        return polygons;

    } catch (error) {
        console.error('解析建筑物文件失败:', error);
        return [];
    }
}

export function parseWKTCoordinates(wkt) {
    try {
        // 移除可能的引号
        const cleanWkt = wkt.replace(/^"|"$/g, '').trim();
        //console.log('解析WKT:', cleanWkt);

        const match = cleanWkt.match(/\(\(\(([^)]+)\)\)\)/);
        if (!match) {
            console.warn('无法解析 WKT 格式:', cleanWkt);
            return null;
        }

        const coordsStr = match[1];
        const coordPairs = coordsStr.split(',');
        const coordinates = [];

        for (let pair of coordPairs) {
            const trimmedPair = pair.trim();
            if (trimmedPair) {
                const [lonStr, latStr] = trimmedPair.split(' ');
                const lon = parseFloat(lonStr);
                const lat = parseFloat(latStr);

                // 验证坐标是否有效
                if (!isNaN(lon) && !isNaN(lat) && isFinite(lon) && isFinite(lat)) {
                    coordinates.push(lon, lat);
                } else {
                    console.warn('无效坐标:', lonStr, latStr);
                    return null;
                }
            }
        }

        // 确保坐标数组长度为偶数且不为空
        if (coordinates.length === 0 || coordinates.length % 2 !== 0) {
            console.warn('坐标数组长度不正确:', coordinates);
            return null;
        }

        //console.log('成功解析坐标:', coordinates);
        return coordinates;
    } catch (error) {
        console.error('解析 WKT 坐标时出错:', error);
        return null;
    }
}

export function bufferPolygon(coordinates, distance) {
    // 添加新的高亮建筑
    let coords = coordinates;

    // 使用 turf 对原建筑轮廓做缓冲（单位：米）
    try {
        // 把 coordinates 转成 [[lon, lat], [lon, lat], ...]
        const coordPairs = [];
        for (let i = 0; i < coords.length; i += 2) {
            coordPairs.push([coords[i], coords[i + 1]]);
        }

        // 用原始坐标构造 Polygon（GeoJSON 格式要求外环闭合，所以最后一个点要等于第一个点）
        if (coordPairs[0][0] !== coordPairs[coordPairs.length - 1][0] ||
            coordPairs[0][1] !== coordPairs[coordPairs.length - 1][1]) {
            coordPairs.push(coordPairs[0]);
        }

        const polygonGeoJSON = turf.polygon([coordPairs]);

        // 缓冲 distance 米（可以改成更大）
        const buffered = turf.buffer(polygonGeoJSON, distance, { units: 'meters' });

        // 从缓冲后的多边形取新坐标（只取外环）
        const bufferedCoords = buffered.geometry.coordinates[0].flatMap(coord => [coord[0], coord[1]]);

        coords = bufferedCoords;
        return coords;
    } catch (err) {
        console.error('缓冲建筑失败:', err);
    }
}
