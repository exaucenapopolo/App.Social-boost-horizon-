const fs = require("fs");

for (const file of ["package-lock.json", "yarn.lock"]) {
  fs.rmSync(file, { force: true });
}

const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
