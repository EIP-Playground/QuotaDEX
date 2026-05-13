import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const skill = await readFile(
    path.join(process.cwd(), "skills/quotadex-seller/SKILL.md"),
    "utf8"
  );

  return new Response(skill, {
    headers: {
      "content-type": "text/markdown; charset=utf-8"
    }
  });
}
