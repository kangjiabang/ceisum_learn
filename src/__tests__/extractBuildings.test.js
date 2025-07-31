  }
}));

// Mock turf 相关功能
jest.mock('@turf/turf', () => ({
    points: jest.fn(),
    clustersDbscan: jest.fn(),
    convex: jest.fn(),
    area: jest.fn(),
    center: jest.fn()
}));

// Mock viewer.scene
const mockScene = {
    pickFromRay: jest.fn(),
    globe: {
        pick: jest.fn()
    }
};

const mockViewer = {
    scene: mockScene
};

describe('extractBuildingsByRayCasting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return empty array when no buildings are detected', async () => {
        mockScene.pickFromRay.mockReturnValue(null);
        const result = await extractBuildingsByRayCasting(mockViewer, {
