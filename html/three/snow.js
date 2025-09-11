import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js';

let scene, camera, renderer;
let snowParticles, snowGeo, snowMaterial;
const snowCount = 2000;
const snowData = [];

init();
animate();

function init() {
    scene = new THREE.Scene();

    // 天空蓝渐变背景
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#87CEEB'); // 天空蓝
    gradient.addColorStop(1, '#ffffff'); // 白色
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);
    scene.background = new THREE.CanvasTexture(canvas);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 雪花几何体
    snowGeo = new THREE.BufferGeometry();
    const positions = [];
    const sizes = [];
    const colors = [];

    // 自动生成多种雪花纹理
    const snowTextures = [
        createCircleSnowTexture(),
        createHexSnowTexture(),
        createStarSnowTexture()
    ];

    for (let i = 0; i < snowCount; i++) {
        const x = (Math.random() - 0.5) * 400;
        const y = Math.random() * 200;
        const z = (Math.random() - 0.5) * 400;
        positions.push(x, y, z);

        const size = 1 + (50 - Math.abs(z)) * 0.05 + Math.random() * 1.5;
        sizes.push(size);

        // 根据 z 轴远近设置透明度，近处 1，远处 0.3
        const alpha = THREE.MathUtils.clamp(1 - Math.abs(z) / 100, 0.3, 1);
        colors.push(alpha, alpha, alpha); // 使用颜色通道存储透明度（可用自定义Shader更精细）

        snowData.push({
            velocity: 0.2 + Math.random() * 0.5,
            rotation: Math.random() * 2 * Math.PI,
            rotationSpeed: (Math.random() - 0.5) * 0.02,
            texture: snowTextures[Math.floor(Math.random() * snowTextures.length)],
            size: size,
            opacity: alpha
        });
    }

    snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    snowGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    snowGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // 使用 AdditiveBlending 解决远处雪花偏黑
    snowMaterial = new THREE.PointsMaterial({
        size: 2,
        map: snowTextures[2],
        vertexColors: true, // 使用颜色控制透明度
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    snowParticles = new THREE.Points(snowGeo, snowMaterial);
    scene.add(snowParticles);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const positions = snowGeo.attributes.position.array;
    const sizes = snowGeo.attributes.size.array;

    for (let i = 0; i < snowCount; i++) {
        const idx = i * 3;

        positions[idx + 1] -= snowData[i].velocity;

        if (positions[idx + 1] < -100) {
            positions[idx + 1] = 100;
            positions[idx] = (Math.random() - 0.5) * 400;
            positions[idx + 2] = (Math.random() - 0.5) * 400;
        }

        positions[idx] += Math.sin(snowData[i].rotation) * 0.05;
        positions[idx + 2] += Math.cos(snowData[i].rotation) * 0.05;

        snowData[i].rotation += snowData[i].rotationSpeed;
        sizes[i] = snowData[i].size; // 保持随机大小
    }

    snowGeo.attributes.position.needsUpdate = true;
    snowGeo.attributes.size.needsUpdate = true;

    renderer.render(scene, camera);
}

// === 自动生成雪花纹理函数 ===
function createCircleSnowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
}

function createHexSnowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const x = 32 + 20 * Math.cos(angle);
        const y = 32 + 20 * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

function createStarSnowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = Math.PI / 4 * i;
        const x1 = 32 + 20 * Math.cos(angle);
        const y1 = 32 + 20 * Math.sin(angle);
        const x2 = 32 - 20 * Math.cos(angle);
        const y2 = 32 - 20 * Math.sin(angle);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}
