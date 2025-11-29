// console.clear();

// --- 1. Three.js 场景初始化 ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});

renderer.setClearColor(new THREE.Color("rgb(0,0,0)"));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 1.8;

const controls = new THREE.TrackballControls(camera, renderer.domElement);
controls.noPan = true;
controls.maxDistance = 3;
controls.minDistance = 0.7;

const group = new THREE.Group();
scene.add(group);

// --- 全局变量：爆炸扩散系数 (0.0 = 正常, 1.0 = 最大爆炸) ---
window.explosionFactor = 0;
let textSystem = null; // 全局引用文字粒子系统

// --- 2. 模型与粒子加载 ---
let heart = null;
let sampler = null;
let originHeart = null;

new THREE.OBJLoader().load(
  "https://assets.codepen.io/127738/heart_2.obj",
  (obj) => {
    heart = obj.children[0];
    heart.geometry.rotateX(-Math.PI * 0.5);
    heart.geometry.scale(0.04, 0.04, 0.04);
    heart.geometry.translate(0, -0.4, 0);
    group.add(heart);

    const fontLoader = new THREE.FontLoader();
    fontLoader.load(
      "https://cdn.jsdelivr.net/npm/three@0.132.2/examples/fonts/helvetiker_regular.typeface.json",
      (font) => {
        // 1. 生成文字几何体
        const textGeo = new THREE.TextGeometry("Cecily", {
          font: font,
          size: 0.06,
          height: 0.005,
          curveSegments: 8,
          bevelEnabled: false,
        });
        textGeo.center();

        // 2. 创建一个临时的 Mesh 用于采样
        const tempMaterial = new THREE.MeshBasicMaterial();
        const tempMesh = new THREE.Mesh(textGeo, tempMaterial);

        // 3. 使用采样器在文字表面提取点
        const textSampler = new THREE.MeshSurfaceSampler(tempMesh).build();
        const textPoints = [];
        const textColors = [];
        const tempPos = new THREE.Vector3();

        // 恢复为普通的深粉色，不需要特别亮
        const targetColor = new THREE.Color(0xff3399);

        // 采样 1500 个粒子
        for (let i = 0; i < 1500; i++) {
          textSampler.sample(tempPos);
          textPoints.push(tempPos.x, tempPos.y, tempPos.z);
          textColors.push(targetColor.r, targetColor.g, targetColor.b);
        }

        const textGeoParticles = new THREE.BufferGeometry();
        textGeoParticles.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(textPoints, 3)
        );
        textGeoParticles.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(textColors, 3)
        );

        // --- 修改点：取消高亮，使用普通材质 ---
        const textMaterialParticles = new THREE.PointsMaterial({
          vertexColors: true,
          size: 0.005, // 普通大小
          sizeAttenuation: true,
          // 移除了 map (贴图) 和 blending (叠加混合)，使其变为普通实心粒子
        });

        textSystem = new THREE.Points(textGeoParticles, textMaterialParticles);
        textSystem.position.set(0, 0.05, 0.1);
        group.add(textSystem);
      }
    );

    heart.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color("rgb(0,0,0)"),
    });
    originHeart = Array.from(heart.geometry.attributes.position.array);

    sampler = new THREE.MeshSurfaceSampler(heart).build();

    initParticles();

    // 启动视觉系统
    initComputerVision();

    renderer.setAnimationLoop(render);
  }
);

// --- 3. 粒子系统逻辑 ---
let positions = [];
let colors = [];
const geometry = new THREE.BufferGeometry();

const material = new THREE.PointsMaterial({
  vertexColors: true,
  size: 0.009,
});

const particles = new THREE.Points(geometry, material);
group.add(particles);

const simplex = new SimplexNoise();
const pos = new THREE.Vector3();
const palette = [
  new THREE.Color("#ff99c8"),
  new THREE.Color("#ff66b3"),
  new THREE.Color("#ff3399"),
  new THREE.Color("#e60073"),
];

class SparkPoint {
  constructor() {
    sampler.sample(pos);
    this.color = palette[Math.floor(Math.random() * palette.length)];
    this.rand = Math.random() * 0.03;
    this.pos = pos.clone();
    this.one = null;
    this.two = null;
  }

  update(a) {
    const noise =
      simplex.noise4D(this.pos.x * 1, this.pos.y * 1, this.pos.z * 1, 0.1) +
      1.5;
    const noise2 =
      simplex.noise4D(this.pos.x * 500, this.pos.y * 500, this.pos.z * 500, 1) +
      1;

    // 爆炸逻辑
    const explodeScale = window.explosionFactor * 8.0;

    this.one = this.pos
      .clone()
      .multiplyScalar(1.01 + noise * 0.15 * beat.a + explodeScale);
    this.two = this.pos
      .clone()
      .multiplyScalar(
        1 + (noise2 * 1 * (beat.a + 0.3) - beat.a * 1.2) + explodeScale
      );
  }
}

let spikes = [];

function initParticles(a) {
  positions = [];
  colors = [];
  for (let i = 0; i < 10000; i++) {
    const g = new SparkPoint();
    spikes.push(g);
  }
}

const beat = { a: 0 };
gsap
  .timeline({
    repeat: -1,
    repeatDelay: 0.3,
  })
  .to(beat, {
    a: 0.5,
    duration: 0.6,
    ease: "power2.in",
  })
  .to(beat, {
    a: 0.0,
    duration: 0.6,
    ease: "power3.out",
  });

const maxZ = 0.23;
const rateZ = 0.5;

function render(a) {
  // 1. 更新爱心粒子
  positions = [];
  colors = [];
  spikes.forEach((g, i) => {
    g.update(a);
    const rand = g.rand;
    const color = g.color;
    // 爆炸时取消 z轴裁剪
    if (window.explosionFactor > 0.1) {
      positions.push(g.one.x, g.one.y, g.one.z);
      colors.push(color.r, color.g, color.b);
      positions.push(g.two.x, g.two.y, g.two.z);
      colors.push(color.r, color.g, color.b);
    } else {
      // 正常模式
      if (maxZ * rateZ + rand > g.one.z && g.one.z > -maxZ * rateZ - rand) {
        positions.push(g.one.x, g.one.y, g.one.z);
        colors.push(color.r, color.g, color.b);
      }
      if (
        maxZ * rateZ + rand * 2 > g.one.z &&
        g.one.z > -maxZ * rateZ - rand * 2
      ) {
        positions.push(g.two.x, g.two.y, g.two.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  });

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3)
  );
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;

  // 2. 更新文字粒子的缩放 (跟随爆炸)
  if (textSystem) {
    const textScale = 1 + window.explosionFactor * 5.0;
    textSystem.scale.set(textScale, textScale, textScale);
  }

  // 3. 更新实体心
  const heartScale = 1 + window.explosionFactor * 2.0;
  if (heart) {
    const baseScale = 0.04;
    heart.scale.set(
      baseScale * heartScale,
      baseScale * heartScale,
      baseScale * heartScale
    );
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- 4. 视觉控制与监控 UI 模块 ---

let lastHandPosition = { x: null, y: null };
let isAnimating = false;
let statusElement = null;

function initComputerVision() {
  createMonitorUI();

  const videoElement = document.getElementById("input-video");

  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onHandsResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 320,
    height: 240,
  });

  camera.start();
}

function createMonitorUI() {
  const monitorDiv = document.createElement("div");
  monitorDiv.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    width: 240px;
    height: 180px;
    border: 3px solid #ff3399;
    border-radius: 12px;
    overflow: hidden;
    z-index: 1000;
    background: #000;
    box-shadow: 0 0 15px rgba(255, 51, 153, 0.5);
  `;

  let vid = document.getElementById("input-video");
  if (!vid) {
    vid = document.createElement("video");
    vid.id = "input-video";
    vid.autoplay = true;
    vid.playsInline = true;
  }
  vid.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  `;
  monitorDiv.appendChild(vid);

  const statusDiv = document.createElement("div");
  statusDiv.id = "gesture-status";
  statusDiv.innerText = "等待手势...";
  statusDiv.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    padding: 8px 0;
    text-align: center;
    color: #fff;
    font-family: 'Arial', sans-serif;
    font-weight: bold;
    font-size: 16px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    transition: all 0.3s;
  `;
  monitorDiv.appendChild(statusDiv);
  statusElement = statusDiv;

  document.body.appendChild(monitorDiv);
}

function updateStatus(text, active = false) {
  if (!statusElement) return;
  statusElement.innerText = text;
  if (active) {
    statusElement.style.color = "#ff3399";
    statusElement.style.background = "rgba(255, 255, 255, 0.9)";
  } else {
    statusElement.style.color = "#fff";
    statusElement.style.background = "rgba(0, 0, 0, 0.6)";
  }
}

function onHandsResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    const handCenter = landmarks[9];

    // --- 1. 检测张开/握拳 (爆炸控制) ---
    const thumb = landmarks[4];
    const pinky = landmarks[20];
    const distance = Math.sqrt(
      Math.pow(thumb.x - pinky.x, 2) + Math.pow(thumb.y - pinky.y, 2)
    );

    let targetFactor = 0;
    if (distance > 0.3) {
      targetFactor = 1.0;
      updateStatus("🖐 张开 - 粒子扩散", true);
    } else if (distance < 0.15) {
      targetFactor = 0.0;
    } else {
      targetFactor = (distance - 0.15) * 3;
    }

    window.explosionFactor += (targetFactor - window.explosionFactor) * 0.1;

    // --- 2. 检测滑动 (旋转控制) ---
    if (!isAnimating && window.explosionFactor < 0.3) {
      if (lastHandPosition.x === null) {
        lastHandPosition.x = handCenter.x;
        lastHandPosition.y = handCenter.y;
        if (window.explosionFactor < 0.1)
          updateStatus("捕捉中 - 请滑动", false);
        return;
      }

      const deltaX = handCenter.x - lastHandPosition.x;
      const deltaY = handCenter.y - lastHandPosition.y;
      const threshold = 0.08;

      let triggered = false;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0) {
            rotateModel("right");
            updateStatus("➡ 向右旋转", true);
            triggered = true;
          } else {
            rotateModel("left");
            updateStatus("⬅ 向左旋转", true);
            triggered = true;
          }
        }
      } else {
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0) {
            rotateModel("down");
            updateStatus("⬇ 向下旋转", true);
            triggered = true;
          } else {
            rotateModel("up");
            updateStatus("⬆ 向上旋转", true);
            triggered = true;
          }
        }
      }

      if (!triggered) {
        lastHandPosition.x = handCenter.x;
        lastHandPosition.y = handCenter.y;
      } else {
        lastHandPosition.x = null;
        lastHandPosition.y = null;
      }
    }
  } else {
    lastHandPosition.x = null;
    lastHandPosition.y = null;
    window.explosionFactor *= 0.9;

    if (!isAnimating) {
      updateStatus("等待手势...", false);
    }
  }
}

function rotateModel(direction) {
  if (!group || isAnimating) return;
  isAnimating = true;

  const rotationAmount = Math.PI * 2;
  const duration = 2.0;

  let targetProps = {};

  switch (direction) {
    case "right":
      targetProps.y = group.rotation.y + rotationAmount;
      break;
    case "left":
      targetProps.y = group.rotation.y - rotationAmount;
      break;
    case "down":
      targetProps.x = group.rotation.x + rotationAmount;
      break;
    case "up":
      targetProps.x = group.rotation.x - rotationAmount;
      break;
  }

  gsap.to(group.rotation, {
    ...targetProps,
    duration: duration,
    ease: "power2.out",
    onComplete: () => {
      isAnimating = false;
      updateStatus("等待手势...", false);
    },
  });
}
