/**
 * inspect-project — print Project fields, items, and field values
 *
 * Usage: npm run inspect
 * Env:   AI_TEAM_GITHUB_TOKEN
 */
import {
  loadProject,
  buildFieldMaps,
  getItemFields,
} from "../src/project-client.mjs";

async function main() {
  const project = await loadProject();
  const { fieldsByName } = buildFieldMaps(project);

  console.log("=== Project ===");
  console.log(JSON.stringify({ id: project.id, title: project.title }, null, 2));

  console.log("\n=== Fields ===");
  for (const [name, field] of fieldsByName) {
    const info = { name, dataType: field.dataType };
    if (field.options) {
      info.options = field.options.map((o) => o.name);
    }
    console.log(JSON.stringify(info));
  }

  console.log("\n=== Items ===");
  for (const item of project.items.nodes) {
    if (!item?.content) continue;
    const fields = getItemFields(item);
    console.log(
      JSON.stringify(
        {
          itemId: item.id,
          number: item.content.number,
          title: item.content.title,
          url: item.content.url,
          fields,
        },
        null,
        2
      )
    );
    console.log("---");
  }

  console.log(`\nTotal items: ${project.items.nodes.filter(Boolean).length}`);
}

main().catch((err) => {
  console.error("inspect failed:", err.message);
  process.exit(1);
});
