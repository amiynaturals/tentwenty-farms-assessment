const https = require("https");
const fs = require("fs");
const env = Object.fromEntries(
  fs
    .readFileSync("D:/10twenty/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
function get(p) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: env.SHOPIFY_STORE_DOMAIN,
          path: p,
          headers: { "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN },
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => resolve(d));
        }
      )
      .on("error", reject);
  });
}
(async () => {
  const enc = encodeURIComponent("sections/collection-list.liquid");
  const raw = await get(
    `/admin/api/2024-10/themes/198425739633/assets.json?asset[key]=${enc}`
  );
  const a = JSON.parse(raw);
  const v = a.asset.value;
  const i = v.lastIndexOf("{% schema %}");
  fs.writeFileSync(
    "D:/10twenty/shopify/_collection_list_schema.txt",
    v.slice(i)
  );
  console.log("wrote schema", v.length);
})().catch(console.error);
