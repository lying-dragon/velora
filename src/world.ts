import { mountainGeometry } from "./mountain";
import { StandingMotion } from "./rider-motion";
import * as THREE from "three";

const TAU = Math.PI * 2;
export const routes = {
  coast: {
    name: "에메랄드 코스트",
    english: "EMERALD COAST",
    subtitle: "바다와 숲 사이, 나를 위한 한 바퀴",
    scale: 1,
    hills: 1,
    label: "해안 순환",
    difficulty: "보통",
  },
  alpine: {
    name: "알파인 루프",
    english: "ALPINE LOOP",
    subtitle: "조금 더 높은 곳으로 향하는 라이딩",
    scale: 1.3,
    hills: 2.4,
    label: "산악 순환",
    difficulty: "어려움",
  },
  canyon: {
    name: "레드록 캐니언",
    english: "REDROCK CANYON",
    subtitle: "붉은 사암 절벽과 선인장 사이의 굽이진 사막길",
    scale: 1.15,
    hills: 1.4,
    label: "사막 협곡",
    difficulty: "보통",
  },
  forest: {
    name: "미스트 포레스트",
    english: "MIST FOREST",
    subtitle: "짙은 안개와 거대한 침엽수가 감싸는 숲길",
    scale: 1.05,
    hills: 0.8,
    label: "깊은 숲",
    difficulty: "보통",
  },
  metro: {
    name: "네온 시티",
    english: "NEON CITY",
    subtitle: "네온 게이트와 빌딩 사이, 야간 도심 서킷",
    scale: 0.95,
    hills: 0.08,
    label: "야간 도심",
    difficulty: "쉬움",
  },
  recovery: {
    name: "선셋 파크",
    english: "SUNSET PARK",
    subtitle: "가볍게 페달을 돌리며 만나는 여유",
    scale: 0.75,
    hills: 0.12,
    label: "평지 순환",
    difficulty: "쉬움",
  },
};
export type RouteKey = keyof typeof routes;
export class Course {
  curve: THREE.CatmullRomCurve3;
  length: number;
  ascent: number;
  constructor(public key: RouteKey) {
    const r = routes[key];
    const points = Array.from({ length: 32 }, (_, i) => {
      const t = (i / 32) * TAU;
      const radius =
        key === "metro"
          ? 320 /
            Math.pow(
              Math.pow(Math.abs(Math.sin(t)), 4) +
                Math.pow(Math.abs(Math.cos(t)), 4),
              0.25,
            )
          : key === "canyon"
            ? 320 + 75 * Math.sin(2 * t)
            : key === "forest"
              ? 320 + 50 * Math.cos(4 * t)
              : key === "recovery"
                ? 320
                : 320 + 40 * Math.sin(3 * t) + 25 * Math.cos(5 * t);
      return new THREE.Vector3(
        Math.sin(t) * radius * r.scale,
        15 + (7 * Math.cos(t) + 3 * Math.cos(2 * t)) * r.hills,
        Math.cos(t) * radius * r.scale * 0.8,
      );
    });
    this.curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
    this.curve.arcLengthDivisions = 4000;
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
    this.ascent = 0;
    for (let i = 0; i < 1000; i++)
      this.ascent += Math.max(
        0,
        this.point((i + 1) / 1000).y - this.point(i / 1000).y,
      );
  }
  point(t: number) {
    return this.curve.getPointAt(((t % 1) + 1) % 1);
  }
  tangent(t: number) {
    return this.curve.getTangentAt(((t % 1) + 1) % 1);
  }
  cornerLimit(distance: number) {
    // Comfort lateral acceleration 1.8 m/s²; brake in advance over 40 m.
    let limit = Infinity;
    for (const ahead of [0, 15, 30, 45]) {
      const a = this.tangent((distance + ahead - 2) / this.length),
        b = this.tangent((distance + ahead + 2) / this.length);
      a.y = 0;
      b.y = 0;
      a.normalize();
      b.normalize();
      const curvature = Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) / 4;
      const local = Math.sqrt(1.8 / Math.max(curvature, 1e-5));
      limit = Math.min(limit, Math.sqrt(local * local + 2 * 2 * ahead));
    }
    return limit;
  }
  grade(distance: number) {
    const t = distance / this.length;
    const a = this.point(t - 1 / this.length),
      b = this.point(t + 1 / this.length);
    return (b.y - a.y) / Math.max(0.1, Math.hypot(b.x - a.x, b.z - a.z));
  }
}
const mat = (color: number, roughness = 1) =>
  new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
const materials = {
  road: mat(0x45575a),
  edge: mat(0xd9dbc8),
  grass: mat(0x7b9c7a),
  trunk: mat(0x685948),
  leaves: mat(0x47796a),
  leaves2: mat(0x6c9774),
  rock: mat(0x84938b),
  black: mat(0x17292e),
  skin: mat(0xd1a281),
  white: mat(0xeaf3e6),
  orange: mat(0xfb723e),
  metal: mat(0x819897),
};
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function bar(
  parent: THREE.Object3D,
  a: number[],
  b: number[],
  radius: number,
  material: THREE.Material,
) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const m = mesh(
    new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 6),
    material,
    parent,
  );
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize(),
  );
  return m;
}
export class Rider {
  group = new THREE.Group();
  bike = new THREE.Group();
  body = new THREE.Group();
  arms: THREE.Group[] = [];
  motion = new StandingMotion();
  legs: THREE.Group[] = [];
  wheels: THREE.Mesh[] = [];
  phase = 0;
  constructor(color: number) {
    const frame = mat(color);
    const g = this.bike;
    this.group.add(this.bike, this.body);
    for (const z of [-0.57, 0.57]) {
      const w = mesh(
        new THREE.TorusGeometry(0.34, 0.032, 7, 24),
        materials.black,
        g,
        0,
        0.36,
        z,
      );
      w.rotation.y = Math.PI / 2;
      this.wheels.push(w);
      const rim = mesh(
        new THREE.TorusGeometry(0.306, 0.014, 6, 24),
        materials.metal,
        g,
        0,
        0.36,
        z,
      );
      rim.rotation.y = Math.PI / 2;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        bar(
          g,
          [0, 0.36, z],
          [0, 0.36 + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3],
          0.006,
          materials.metal,
        );
      }
    }
    const bb = [0, 0.34, 0],
      seat = [0, 0.85, -0.21],
      rear = [0, 0.36, -0.57],
      head = [0, 0.89, 0.4],
      front = [0, 0.36, 0.57];
    for (const [a, b] of [
      [bb, seat],
      [seat, rear],
      [rear, bb],
      [seat, head],
      [head, bb],
      [head, front],
    ])
      bar(g, a, b, 0.033, frame);
    bar(g, seat, [0, 1, -0.25], 0.025, materials.metal);
    mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.28),
      materials.black,
      g,
      0,
      1,
      -0.25,
    );
    bar(g, head, [0, 1.08, 0.48], 0.025, materials.metal);
    bar(g, [-0.24, 1.08, 0.48], [0.24, 1.08, 0.48], 0.024, materials.black);
    const bodyStart = g.children.length;
    const jersey = mesh(
      new THREE.CapsuleGeometry(0.2, 0.35, 4, 7),
      frame,
      g,
      0,
      1.38,
      -0.07,
    );
    jersey.rotation.x = 0.85;
    mesh(
      new THREE.SphereGeometry(0.21, 8, 6),
      materials.black,
      g,
      0,
      1.11,
      -0.3,
    ).scale.set(1, 0.65, 1);
    bar(g, [0, 1.59, 0.12], [0, 1.73, 0.25], 0.09, materials.skin);
    mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      materials.skin,
      g,
      0,
      1.73,
      0.25,
    );
    const helmet = mesh(
      new THREE.SphereGeometry(0.165, 10, 7),
      materials.white,
      g,
      0,
      1.84,
      0.24,
    );
    helmet.scale.set(1, 0.8, 1.25);
    for (const x of [-0.08, 0, 0.08]) {
      const stripe = mesh(
        new THREE.BoxGeometry(0.023, 0.017, 0.23),
        frame,
        g,
        x,
        1.957,
        0.25,
      );
      stripe.rotation.x = 0.1;
    }
    this.body.add(...g.children.slice(bodyStart));
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      bar(arm, [0, 0, 0], [0, 1, 0], 0.075, frame);
      bar(arm, [0, 0, 0], [0, 1, 0], 0.046, materials.skin);
      this.group.add(arm);
      this.arms.push(arm);
      const leg = new THREE.Group();
      this.group.add(leg);
      this.legs.push(leg);
    }
    this.animate(0, 0, 0);
  }
  animate(dt: number, cadence: number, speed: number, power = 0, ftp = 220) {
    const standing = this.motion.update(dt, power, cadence, ftp);
    this.group.userData.standing = standing;
    this.bike.rotation.z = Math.sin(this.phase) * 0.12 * standing;
    const rise = 0.24 * standing;
    this.body.position.set(
      -Math.sin(this.phase) * 0.035 * standing,
      rise,
      0.13 * standing,
    );
    this.body.rotation.z = -this.bike.rotation.z * 0.2;
    this.bike.updateMatrix();
    this.body.updateMatrix();
    const link = (m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => {
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.y = a.distanceTo(b);
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
    };
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const shoulder = new THREE.Vector3(side * 0.18, 1.57, 0.07).applyMatrix4(
        this.body.matrix,
      );
      const hand = new THREE.Vector3(side * 0.23, 1.08, 0.48).applyMatrix4(
        this.bike.matrix,
      );
      const elbow = shoulder
        .clone()
        .lerp(hand, 0.55)
        .add(new THREE.Vector3(side * 0.06, 0, -0.06));
      link(arm.children[0], shoulder, elbow);
      link(arm.children[1], elbow, hand);
    });
    this.phase += ((dt * cadence) / 60) * TAU;
    for (let i = 0; i < 2; i++) {
      const g = this.legs[i];
      if (!g.children.length) {
        bar(g, [0, 0, 0], [0, 1, 0], 0.09, materials.black);
        bar(g, [0, 0, 0], [0, 1, 0], 0.06, materials.skin);
        mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), materials.white, g);
      }
      const side = i === 0 ? -1 : 1,
        p = this.phase + i * Math.PI;
      const hip = new THREE.Vector3(side * 0.13, 1.07, -0.27).applyMatrix4(
        this.body.matrix,
      );
      const foot = new THREE.Vector3(
        side * 0.16,
        0.36 + Math.sin(p) * 0.17,
        Math.cos(p) * 0.17,
      ).applyMatrix4(this.bike.matrix);
      const knee = new THREE.Vector3(
        side * 0.18,
        (hip.y + foot.y) / 2 + 0.06,
        (hip.z + foot.z) / 2 + 0.32,
      );
      for (let j = 0; j < 2; j++) {
        const a = j === 0 ? hip : knee,
          b = j === 0 ? knee : foot;
        const m = g.children[j];
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.scale.y = a.distanceTo(b);
        m.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          b.clone().sub(a).normalize(),
        );
      }
      g.children[2].position.copy(foot);
    }
    this.wheels.forEach((w) => (w.rotation.z -= (speed * dt) / 0.34));
  }
}
export class World {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(57, 1, 0.5, 2200);
  course = new Course("coast");
  environment = new THREE.Group();
  rider = new Rider(0xfa7546);
  bots: Rider[] = [];
  cameraMode = 0;
  private readyCamera = false;
  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3인칭 자전거 주행 월드",
    );
    this.scene.background = new THREE.Color(0xb4d0cf);
    this.scene.fog = new THREE.Fog(0xb4d0cf, 220, 1900);
    this.scene.add(new THREE.HemisphereLight(0xe6f5fb, 0x65765a, 2.4));
    const sun = new THREE.DirectionalLight(0xffe5be, 3.3);
    sun.position.set(-100, 200, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.far = 450;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(this.environment, this.rider.group);
    this.bots = [new Rider(0x7cbbb7), new Rider(0xf6c456), new Rider(0xa8b8d1)];
    this.bots.forEach((b) => this.scene.add(b.group));
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(container);
    window.addEventListener("resize", resize);
    resize();
    this.setCourse("coast");
    this.updateSun = (p: THREE.Vector3) => {
      sun.position.copy(p).add(new THREE.Vector3(-70, 160, 80));
      sun.target.position.copy(p);
    };
  }
  private updateSun: (p: THREE.Vector3) => void = () => {};
  setCourse(key: RouteKey) {
    const shared = new Set<THREE.Material>(Object.values(materials));
    const disposed = new Set<THREE.Material>();
    this.environment.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          if (!shared.has(material) && !disposed.has(material)) {
            material.dispose();
            disposed.add(material);
          }
        }
      }
    });
    this.environment.clear();
    this.course = new Course(key);
    this.readyCamera = false;
    const course = this.course,
      g = this.environment;
    const palette = {
      coast: [0xb4d0cf, 0x7b9c7a, 0x45575a, 0x47796a, 0x6c9774, 0x5dabb2],
      alpine: [0xbdccdc, 0xc6d0cf, 0x3c4752, 0x274a49, 0x567971, 0xa8c9d6],
      recovery: [0xf0bb98, 0xa59b62, 0x665853, 0xbe6240, 0xdfa449, 0x819b9b],
      canyon: [0xe8bf97, 0xbd7048, 0x715549, 0x56815b, 0x779456, 0xc59165],
      forest: [0x73968b, 0x36564a, 0x35443f, 0x153f34, 0x2d6050, 0x486f66],
      metro: [0x122239, 0x344455, 0x1d2639, 0x3e736f, 0x42647a, 0x142e43],
    }[key];
    this.scene.background = new THREE.Color(palette[0]);
    this.scene.fog = new THREE.Fog(
      palette[0],
      key === "forest" ? 70 : 250,
      key === "forest" ? 650 : 1900,
    );
    materials.grass.color.setHex(palette[1]);
    materials.road.color.setHex(palette[2]);
    materials.leaves.color.setHex(palette[3]);
    materials.leaves2.color.setHex(palette[4]);
    materials.rock.color.setHex(key === "canyon" ? 0x9e4d33 : 0x84938b);
    this.renderer.toneMappingExposure = key === "metro" ? 0.85 : 1.25;
    g.userData.theme = key;
    const ribbon = (
      halfWidth: number,
      height: number,
      material: THREE.Material,
    ) => {
      const verts: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= 1400; i++) {
        const t = i / 1400,
          p = course.point(t),
          d = course.tangent(t);
        const n = new THREE.Vector3(d.z, 0, -d.x).normalize();
        for (const sign of [-1, 1]) {
          verts.push(
            p.x + n.x * halfWidth * sign,
            p.y + height,
            p.z + n.z * halfWidth * sign,
          );
        }
        if (i < 1400) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return mesh(geom, material, g);
    };
    // Broad grassy embankment follows the track, avoiding road/terrain intersections.
    // Continuous island slopes down from the road shoulder to sea level.
    const terrainVertices: number[] = [],
      terrainIndices: number[] = [];
    const cross = [-100, -65, -24, 0, 24, 90, 180];
    for (let i = 0; i <= 600; i++) {
      const p = course.point(i / 600),
        d = course.tangent(i / 600),
        n = new THREE.Vector3(d.z, 0, -d.x).normalize();
      cross.forEach((offset, j) => {
        const y =
          j === 0
            ? -8
            : j === 1
              ? -3
              : j < 5
                ? p.y - 0.22
                : Math.max(-3, p.y - (j - 4) * 4);
        terrainVertices.push(p.x + n.x * offset, y, p.z + n.z * offset);
      });
      if (i < 600)
        for (let j = 0; j < cross.length - 1; j++) {
          const a = i * cross.length + j;
          terrainIndices.push(
            a,
            a + cross.length,
            a + 1,
            a + 1,
            a + cross.length,
            a + cross.length + 1,
          );
        }
    }
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(terrainVertices, 3),
    );
    terrain.setIndex(terrainIndices);
    terrain.computeVertexNormals();
    mesh(terrain, materials.grass, g);
    ribbon(24, -0.18, materials.grass);
    ribbon(5.2, -0.03, materials.edge);
    ribbon(4.8, 0, materials.road);
    for (let i = 0; i < course.length; i += 10) {
      const t = i / course.length,
        p = course.point(t),
        d = course.tangent(t);
      const dash = mesh(
        new THREE.BoxGeometry(0.13, 0.015, 3),
        materials.edge,
        g,
        p.x,
        p.y + 0.025,
        p.z,
      );
      dash.rotation.y = Math.atan2(d.x, d.z);
      dash.rotation.x = -Math.asin(d.y);
    }
    // Stable procedural landscape; no external models or textures.
    let seed = 42 + Object.keys(routes).indexOf(key) * 711;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5),
      pineGeom = new THREE.ConeGeometry(2.1, 6, 7);
    for (let i = 0; i < 470; i++) {
      const t = random(),
        p = course.point(t),
        d = course.tangent(t),
        side = random() > 0.38 ? 1 : -1,
        offset = 10 + random() * 12;
      const normal = new THREE.Vector3(d.z, 0, -d.x).normalize();
      p.addScaledVector(normal, offset * side);
      if (key === "metro") {
        if (i > 170) continue;
        const building = new THREE.Group();
        building.position.copy(p).addScaledVector(normal, side * 12);
        g.add(building);
        const height = 8 + random() * 35;
        mesh(
          new THREE.BoxGeometry(7, height, 7),
          mat(i % 2 ? 0x283e58 : 0x35465f),
          building,
          0,
          height / 2,
          0,
        );
        const glow = new THREE.MeshBasicMaterial({
          color: i % 2 ? 0x69d9e4 : 0xffaa6a,
        });
        for (let y = 3; y < height; y += 3)
          mesh(
            new THREE.BoxGeometry(5, 0.6, 7.08),
            glow,
            building,
            0,
            y,
            0,
          ).castShadow = false;
        continue;
      }
      if (key === "canyon") {
        if (i > 180) continue;
        if (i % 3 === 0) {
          const cliff = mesh(
            new THREE.CylinderGeometry(
              4 + random() * 4,
              7 + random() * 6,
              12 + random() * 15,
              5,
            ),
            mat(i % 2 ? 0xae6744 : 0xc98656),
            g,
            p.x + normal.x * side * 22,
            p.y + 5,
            p.z + normal.z * side * 22,
          );
          cliff.rotation.y = random() * TAU;
        } else {
          const cactus = new THREE.Group();
          cactus.position.copy(p);
          g.add(cactus);
          mesh(
            new THREE.CapsuleGeometry(0.35, 3, 3, 5),
            materials.leaves,
            cactus,
            0,
            1.6,
            0,
          );
          bar(cactus, [0, 1.4, 0], [1, 1.4, 0], 0.22, materials.leaves);
          bar(cactus, [1, 1.4, 0], [1, 2.5, 0], 0.22, materials.leaves);
        }
        continue;
      }
      if (i % 5 === 0) {
        const rock = mesh(
          new THREE.DodecahedronGeometry(1 + random() * 2, 0),
          materials.rock,
          g,
          p.x,
          p.y + 0.1,
          p.z,
        );
        rock.scale.set(1, 0.6, 1.4);
        continue;
      }
      if ((key === "coast" || key === "alpine") && side < 0 && t < 0.32)
        continue;
      const tree = new THREE.Group();
      tree.position.copy(p);
      const scale = (key === "forest" ? 1.7 : 0.65) + random() * 1.1;
      tree.scale.setScalar(scale);
      g.add(tree);
      mesh(trunkGeom, materials.trunk, tree, 0, 1.1, 0);
      if (key === "recovery") {
        mesh(
          new THREE.IcosahedronGeometry(2.6, 1),
          i % 2 ? materials.leaves : materials.leaves2,
          tree,
          0,
          4,
          0,
        );
        if (i % 10 === 0) {
          mesh(
            new THREE.BoxGeometry(2.8, 0.2, 0.8),
            materials.trunk,
            tree,
            2,
            1,
            0,
          );
          bar(tree, [2, 0, 0], [2, 1, 0], 0.12, materials.metal);
        }
        continue;
      }
      mesh(
        pineGeom,
        i % 2 ? materials.leaves : materials.leaves2,
        tree,
        0,
        4,
        0,
      );
      mesh(new THREE.ConeGeometry(1.5, 4, 7), materials.leaves2, tree, 0, 6, 0);
    }
    const water = mesh(
      new THREE.PlaneGeometry(6500, 6500),
      mat(palette[5], 0.4),
      g,
      0,
      -7,
      0,
    );
    water.rotation.x = -Math.PI / 2;
    water.castShadow = false;
    // Layered alpine silhouettes around an open bay.
    for (let i = 0; i < (key === "metro" || key === "recovery" ? 0 : 28); i++) {
      const angle = 0.95 + (i / 28) * 5.3,
        radius = 950 + random() * 350,
        height = (key === "alpine" ? 300 : 150) + random() * 200;
      const mountainRadius = 150 + random() * 170;
      const mount = mesh(
        mountainGeometry(
          mountainRadius,
          height,
          key === "alpine" || (key === "coast" && height > 240),
          key === "canyon" ? 0xa75c40 : 0x819a90,
        ),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          flatShading: true,
          roughness: 1,
        }),
        g,
        Math.sin(angle) * radius,
        height / 2 - 12,
        Math.cos(angle) * radius,
      );
      mount.rotation.y = random() * TAU;
      mount.castShadow = false;
      mount.receiveShadow = false;
    }
    // Roadside guardrail along the scenic waterfront.
    for (let i = 0; i < course.length; i += 12) {
      if (i / course.length > 0.35) continue;
      const p = course.point(i / course.length),
        d = course.tangent(i / course.length),
        n = new THREE.Vector3(d.z, 0, -d.x).normalize();
      p.addScaledVector(n, -5.6);
      mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.05, 5),
        materials.white,
        g,
        p.x,
        p.y + 0.5,
        p.z,
      );
      const q = course.point((i + 12) / course.length),
        d2 = course.tangent((i + 12) / course.length);
      q.addScaledVector(new THREE.Vector3(d2.z, 0, -d2.x).normalize(), -5.6);
      bar(
        g,
        [p.x, p.y + 0.9, p.z],
        [q.x, q.y + 0.9, q.z],
        0.075,
        materials.white,
      );
    }
    if (key === "metro") {
      const light = new THREE.MeshBasicMaterial({ color: 0x44dde6 });
      for (let t = 0.025; t < 1; t += 0.1) {
        const gate = new THREE.Group();
        gate.position.copy(course.point(t));
        const dir = course.tangent(t);
        gate.rotation.y = Math.atan2(dir.x, dir.z);
        g.add(gate);
        for (const x of [-5.8, 5.8])
          mesh(new THREE.BoxGeometry(0.15, 7, 0.15), light, gate, x, 3.5, 0);
        mesh(new THREE.BoxGeometry(11.6, 0.15, 0.15), light, gate, 0, 7, 0);
      }
    }
    // Scenic branded gate; the lap origin remains the map start marker.
    const start = new THREE.Group();
    start.position.copy(course.point(0.045));
    start.rotation.y = Math.atan2(
      course.tangent(0.045).x,
      course.tangent(0.045).z,
    );
    g.add(start);
    for (const x of [-5, 5])
      mesh(
        new THREE.BoxGeometry(0.45, 6, 0.6),
        materials.orange,
        start,
        x,
        3,
        0,
      );
    mesh(
      new THREE.BoxGeometry(10.5, 0.9, 0.6),
      materials.orange,
      start,
      0,
      6,
      0,
    );
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff7df";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("V E L O R A", 256, 47);
    const textMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      side: THREE.DoubleSide,
    });
    mesh(new THREE.PlaneGeometry(6, 0.75), textMat, start, 0, 6, 0.31);
    for (let x = -4; x < 5; x++)
      for (let z = 0; z < 2; z++)
        if ((x + z) % 2 === 0)
          mesh(
            new THREE.BoxGeometry(1, 0.02, 0.5),
            materials.white,
            start,
            x,
            0.03,
            z * 0.5 + 2,
          );
  }
  update(
    distance: number,
    speed: number,
    cadence: number,
    dt: number,
    elapsed: number,
    power = 0,
    ftp = 220,
  ) {
    const course = this.course,
      t = distance / course.length,
      p = course.point(t),
      tangent = course.tangent(t);
    this.rider.group.position.copy(p).add(new THREE.Vector3(0, 0.04, 0));
    this.rider.group.rotation.set(
      -Math.asin(tangent.y),
      Math.atan2(tangent.x, tangent.z),
      0,
      "YXZ",
    );
    this.rider.animate(dt, cadence, speed, power, ftp);
    this.bots.forEach((b, i) => {
      const d = 30 + i * 22 + elapsed * (5 + i * 0.7),
        bt = d / course.length,
        bp = course.point(bt),
        dir = course.tangent(bt);
      bp.addScaledVector(
        new THREE.Vector3(dir.z, 0, -dir.x),
        i % 2 === 0 ? -1.5 : 1.5,
      );
      b.group.position.copy(bp);
      b.group.rotation.set(
        -Math.asin(dir.y),
        Math.atan2(dir.x, dir.z),
        0,
        "YXZ",
      );
      b.animate(dt, 78 + i * 5, 6);
    });
    const back = this.cameraMode === 0 ? 7.6 : this.cameraMode === 1 ? 14 : 4;
    const cp = p
      .clone()
      .addScaledVector(tangent, -back)
      .add(new THREE.Vector3(0, this.cameraMode === 1 ? 6.5 : 3.2, 0));
    if (this.cameraMode === 2)
      cp.addScaledVector(new THREE.Vector3(tangent.z, 0, -tangent.x), 5);
    this.camera.position.lerp(cp, this.readyCamera ? 1 - Math.exp(-dt * 7) : 1);
    this.readyCamera = true;
    this.camera.lookAt(
      p
        .clone()
        .addScaledVector(tangent, 12)
        .add(new THREE.Vector3(0, 1.3, 0)),
    );
    this.updateSun(p);
    this.renderer.render(this.scene, this.camera);
  }
}
