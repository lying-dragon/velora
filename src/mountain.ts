import * as THREE from "three";
/** One continuous surface: snow and rock own disjoint triangles. */
export function mountainGeometry(
  radius: number,
  height: number,
  snow: boolean,
  rockColor = 0x819a90,
) {
  const vertices: number[] = [],
    colors: number[] = [];
  const rock = new THREE.Color(rockColor),
    white = new THREE.Color(0xf1f5ee);
  const ring = (i: number, level: number) => {
    const a = (i * Math.PI * 2) / 5;
    return [
      Math.sin(a) * radius * (1 - level),
      height * (level - 0.5),
      Math.cos(a) * radius * (1 - level),
    ];
  };
  const triangle = (
    a: number[],
    b: number[],
    c: number[],
    color: THREE.Color,
  ) => {
    vertices.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < 5; i++) {
    const a = ring(i, 0),
      b = ring(i + 1, 0),
      c = ring(i, 0.7),
      d = ring(i + 1, 0.7),
      tip = [0, height / 2, 0];
    triangle(a, b, c, rock);
    triangle(b, d, c, rock);
    triangle(c, d, tip, snow ? white : rock);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
