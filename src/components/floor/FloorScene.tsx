"use client";

import { useEffect, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { FloorTable, TableState } from "@/domain/floor";

const stateColor: Record<TableState, string> = {
  available: "#3b8b69",
  reserved: "#b9853e",
  seated: "#527aa2",
  resetting: "#8a6b98",
};

function ContextLossListener({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const element = gl.domElement;
    const handler = (event: Event) => { event.preventDefault(); onLost(); };
    element.addEventListener("webglcontextlost", handler);
    return () => element.removeEventListener("webglcontextlost", handler);
  }, [gl, onLost]);
  return null;
}

export default function FloorScene({
  width,
  depth,
  tables,
  fallback,
  onSelectTable,
  onContextLost,
}: {
  width: number;
  depth: number;
  tables: readonly FloorTable[];
  fallback: ReactNode;
  onSelectTable: (id: string) => void;
  onContextLost: () => void;
}) {
  if (width <= 0 || depth <= 0 || tables.length === 0) return fallback;
  const span = Math.max(width, depth);
  return (
    <div className="three-d-shell" aria-label="Optional 3D floor rendering">
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [span * 0.8, span, span * 0.9], fov: 48, near: 0.05, far: span * 12 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        fallback={<>{fallback}</>}
      >
        <ContextLossListener onLost={onContextLost} />
        <ambientLight intensity={1.6} />
        <directionalLight position={[4, 9, 5]} intensity={1.4} />
        <mesh position={[0, -0.055, 0]}>
          <boxGeometry args={[width, 0.1, depth]} />
          <meshStandardMaterial color="#E7E4D8" />
        </mesh>
        {tables.map((table) => (
          <mesh
            key={table.id}
            position={[table.x - width / 2, 0.38, table.z - depth / 2]}
            rotation={[0, table.rotationRadians, 0]}
            onClick={(event) => { event.stopPropagation(); onSelectTable(table.id); }}
          >
            <boxGeometry args={[table.width, 0.76, table.depth]} />
            <meshStandardMaterial color={stateColor[table.state]} />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}
