import { z } from "zod";

export const tableStateSchema = z.enum(["available", "reserved", "seated", "resetting"]);
export const floorTableSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  x: z.number().finite().nonnegative().max(500),
  z: z.number().finite().nonnegative().max(500),
  width: z.number().finite().positive().max(20),
  depth: z.number().finite().positive().max(20),
  rotationRadians: z.number().finite().min(-Math.PI * 2).max(Math.PI * 2),
  capacity: z.number().int().min(1).max(100),
  state: tableStateSchema,
});

export const floorDraftSchema = z.object({
  version: z.number().int().positive().default(1),
  width: z.number().finite().min(0).max(500),
  depth: z.number().finite().min(0).max(500),
  tables: z.array(floorTableSchema).max(500),
});

export type FloorTable = z.infer<typeof floorTableSchema>;
export type FloorDraft = z.infer<typeof floorDraftSchema>;
export type TableState = z.infer<typeof tableStateSchema>;

export const emptyFloorDraft: FloorDraft = { version: 1, width: 0, depth: 0, tables: [] };

export function assertTablesInsideRoom(draft: FloorDraft) {
  if (draft.width <= 0 || draft.depth <= 0) throw new Error("ROOM_DIMENSIONS_REQUIRED");
  for (const table of draft.tables) {
    if (
      table.x - table.width / 2 < 0 || table.z - table.depth / 2 < 0 ||
      table.x + table.width / 2 > draft.width || table.z + table.depth / 2 > draft.depth
    ) throw new Error("TABLE_OUTSIDE_ROOM");
  }
  return draft;
}
