import fs from "node:fs";

const src = "config/default.json";
const dest = "config/local.json";

if (!fs.existsSync(dest)) {
  fs.copyFileSync(src, dest);
  console.log(`Created ${dest} from ${src}`);
}