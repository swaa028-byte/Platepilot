import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

const dir = path.resolve(".data/e2e");
const db = await PGlite.create(dir);

const user = "4c221b56-8fce-586b-a1e5-a7b804980226";
const memberships = await db.query(
  "select m.user_id, m.role, o.name from memberships m join organizations o on o.id = m.organization_id where m.user_id = $1",
  [user],
);
console.log("memberships:", memberships.rows);
const locations = await db.query("select id, name, organization_id from locations");
console.log("locations:", locations.rows.length);
const orgs = await db.query("select id, name from organizations");
console.log("orgs:", orgs.rows.map((row) => row.name));
await db.close();
