import * as THREE from "three";

/**
 * The actual three.js scene for the hero depth layer, in its own module so
 * the canvas code stays out of the server bundle and loads only where the
 * hero renders.
 */
export function Scene(mount: HTMLElement): Promise<() => void> {
  const width = mount.clientWidth || 1280;
  const height = 460;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.className = "hero-room-canvas";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 6.5, 11);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  // Table states: available, reserved, seated, resetting — the same colors
  // the live floor legend uses.
  const palette = [0x3f8f66, 0xc68a3e, 0x527aa2, 0x8a6b98, 0x4d8f6d];
  const spots: [number, number, number][] = [
    [-5.5, 0, -1],
    [5.2, 0, -2],
    [-1.5, 0, 2.5],
    [2.5, 0, 1.5],
    [0, 0, -4],
  ];
  spots.forEach((spot, index) => {
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.28, 24),
      new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: 0.55, metalness: 0.1 }),
    );
    table.position.set(spot[0], spot[1], spot[2]);
    table.userData.spin = (index % 2 ? 1 : -1) * (0.15 + index * 0.03);
    group.add(table);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.03, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x5fd68f, transparent: true, opacity: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(spot[0], spot[1] - 0.1, spot[2]);
    group.add(ring);
  });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x0e2b23, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2;
  group.add(floor);

  scene.add(new THREE.HemisphereLight(0xdfeee6, 0x0b241d, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 8, 6);
  scene.add(key);

  let running = true;
  let raf = 0;
  const start = performance.now();
  const frame = (now: number) => {
    if (!running) return;
    group.rotation.y = Math.sin((now - start) / 6000) * 0.22;
    group.children.forEach((child) => {
      if (child.userData.spin) child.rotation.y += child.userData.spin * 0.01;
      const mesh = child as THREE.Mesh;
      if (mesh.geometry instanceof THREE.CylinderGeometry) {
        child.position.y = Math.sin((now - start) / 2400 + child.position.x) * 0.12;
      }
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onVisibility = () => {
    running = !document.hidden;
    if (running) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return new Promise((resolve) => {
    resolve(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      renderer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose?.();
      });
      renderer.domElement.remove();
    });
  });
}
