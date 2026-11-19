import { rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Removes the database the end-to-end run uses.
 *
 * The end-to-end checks assert what a fresh install looks like, so they must
 * never see a workspace a previous run created.
 */
const directory = resolve(process.cwd(), ".data/e2e");
rmSync(directory, { recursive: true, force: true });
console.log(`Removed ${directory}`);
