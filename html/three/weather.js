import * as THREE from 'three';

// 场景和雾
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x999999, 20, 200);

// 相机
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 50);

// 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 渐变天空 Shader
const skyGeo = new THREE.SphereGeometry(500, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
        topColor: { value: new THREE.Color(0xaaaaaa) },
        bottomColor: { value: new THREE.Color(0x666666) },
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition).y * 0.5 + 0.5;
            gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }
    `
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// 光源
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
dirLight.position.set(50, 50, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// 地面
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 测试物体
const boxGeo = new THREE.BoxGeometry(5, 5, 5);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
const box = new THREE.Mesh(boxGeo, boxMat);
box.position.y = 2.5;
box.castShadow = true;
scene.add(box);

// 云层
const cloudTexture = new THREE.TextureLoader().load('cloud.jpeg');
const clouds = [];
for (let i = 0; i < 10; i++) {
    const cloudMat = new THREE.MeshBasicMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(50, 25), cloudMat);
    cloud.position.set(Math.random() * 400 - 200, 20 + Math.random() * 20, Math.random() * 400 - 200);
    cloud.rotation.z = Math.random() * Math.PI;
    scene.add(cloud);
    clouds.push(cloud);
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);

    // 云层缓慢移动并面向相机
    clouds.forEach(c => {
        c.position.x += 0.02;
        if (c.position.x > 200) c.position.x -= 400; // 平滑循环
        c.lookAt(camera.position);
    });

    renderer.render(scene, camera);
}
animate();

// 窗口自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
