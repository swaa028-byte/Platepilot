import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * The ingredients, the recipes and the menu items they can be attached to.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId");
    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("app_list_inventory_config", {
      p_location_id: locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

const input = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ingredient"),
    locationId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    baseUnit: z.string().trim().min(1).max(40),
    reorderLevelMilliUnits: z.string().regex(/^[0-9]+$/, "reorderLevelMilliUnits must be an integer string").default("0"),
    unitCostMinor: z.string().regex(/^[0-9]+$/, "unitCostMinor must be an integer string").default("0"),
  }),
  z.object({
    kind: z.literal("recipe"),
    locationId: z.string().uuid(),
    menuItemId: z.string().uuid(),
    ingredientId: z.string().uuid(),
    quantityMilliUnits: z.string().regex(/^[0-9]+$/, "quantityMilliUnits must be an integer string"),
    wastePercent: z.number().int().min(0).max(100).default(0),
  }),
  z.object({
    kind: z.literal("station"),
    locationId: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    color: z.string().trim().max(30).default("slate"),
    sortOrder: z.number().int().min(0).max(999).default(0),
  }),
]);

/**
 * Configures the ingredients, the recipes and the production stations.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-inventory-config:${user.id}`, 120, 60_000);
    const body = input.parse(await request.json());

    const { data, error } = await supabase.rpc(
      body.kind === "ingredient" ? "app_upsert_ingredient"
        : body.kind === "recipe" ? "app_set_recipe_item"
        : "app_upsert_station",
      body.kind === "ingredient"
        ? {
            p_location_id: body.locationId,
            p_name: body.name,
            p_base_unit: body.baseUnit,
            p_reorder_level_milli_units: body.reorderLevelMilliUnits,
            p_unit_cost_minor: body.unitCostMinor,
            p_actor: user.id,
          }
        : body.kind === "recipe"
          ? {
              p_location_id: body.locationId,
              p_menu_item_id: body.menuItemId,
              p_ingredient_id: body.ingredientId,
              p_quantity_milli_units: body.quantityMilliUnits,
              p_waste_percent: body.wastePercent,
              p_actor: user.id,
            }
          : {
              p_location_id: body.locationId,
              p_name: body.name,
              p_color: body.color,
              p_sort_order: body.sortOrder,
              p_actor: user.id,
            },
    );
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
