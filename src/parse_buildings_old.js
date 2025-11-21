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