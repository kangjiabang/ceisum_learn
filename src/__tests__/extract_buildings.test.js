// extract_buildings.test.js
import { getRectAroundPoint, extractBuildingsByRayCasting } from '../extract_buildings.js';
import * as Cesium from 'cesium';
import * as turf from '@turf/turf';

// Mock Cesium and turf modules
jest.mock('cesium');
jest.mock('@turf/turf');

describe('getRectAroundPoint', () => {
    it('should calculate the correct rectangle around a point', () => {
        const centerLon = 116.404;
        const centerLat = 39.915;
        const radiusMeters = 200;

        const result = getRectAroundPoint(centerLon, centerLat, radiusMeters);

        // Verify the result is within expected bounds
        expect(result.west).toBeLessThan(centerLon);
        expect(result.east).toBeGreaterThan(centerLon);
        expect(result.south).toBeLessThan(centerLat);
        expect(result.north).toBeGreaterThan(centerLat);
    });
});

describe('extractBuildingsByRayCasting', () => {
    it('should return an empty array if no hits are detected', async () => {
        const mockViewer = {
            scene: {
                pickFromRay: jest.fn().mockReturnValue(null),
            },
        };

        const options = {
            west: 116.404,
            south: 39.915,
            east: 116.405,
            north: 39.916,
            sampleSpacing: 5.0,
            minHeight: 30.0,
            minArea: 100,
        };

        const result = await extractBuildingsByRayCasting(mockViewer, options);
        expect(result).toEqual([]);
    });

    it('should return buildings if hits are detected and clustered', async () => {
        const mockViewer = {
            scene: {
