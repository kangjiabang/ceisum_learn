export function interpolateCatmullRom(p0, p1, p2, p3, t) {
    // 保持你原有的插值算法
    const t2 = t * t;
    const t3 = t2 * t;

    const x = 0.5 * ((2 * p1[0]) +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

    const y = 0.5 * ((2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

    const z = 0.5 * ((2 * p1[2]) +
        (-p0[2] + p2[2]) * t +
        (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
        (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3);

    return [x, y, z];
}

export function generateInterpolatedPoints(waypoints, segments = 10) {
    const positions = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
        const p0 = waypoints[Math.max(0, i - 1)];
        const p1 = waypoints[i];
        const p2 = waypoints[i + 1];
        const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];

        const pos0 = [p0.lon, p0.lat, p0.alt];
        const pos1 = [p1.lon, p1.lat, p1.alt];
        const pos2 = [p2.lon, p2.lat, p2.alt];
        const pos3 = [p3.lon, p3.lat, p3.alt];

        for (let j = 0; j < segments; j++) {
            const t = j / segments;
            const [lon, lat, alt] = interpolateCatmullRom(pos0, pos1, pos2, pos3, t);
            positions.push({ lon, lat, alt });
        }
    }

    positions.push(waypoints[waypoints.length - 1]);
    return positions;
}