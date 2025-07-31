const test = require('tape');
const turf = require('@turf/turf');

test('turf.clustersDbscan - clusters by distance', function (t) {
    const points = turf.featureCollection([
        turf.point([0, 0]),
        turf.point([0.001, 0.001]),
        turf.point([0.002, 0.002]),
        turf.point([10, 10]),
        turf.point([10.001, 10.001])
    ]);

    const clustered = turf.clustersDbscan(points, 0.5, { units: 'kilometers', minPoints: 2 });

    const cluster0 = clustered.features.filter(f => f.properties.cluster === 0);
    const cluster1 = clustered.features.filter(f => f.properties.cluster === 1);
    const noise = clustered.features.filter(f => f.properties.cluster === 'noise');

    t.equal(cluster0.length, 3, 'Cluster 0 should have 3 points');
    t.equal(cluster1.length, 2, 'Cluster 1 should have 2 points');
    t.equal(noise.length, 0, 'Should be no noise points');

    t.end();
});
