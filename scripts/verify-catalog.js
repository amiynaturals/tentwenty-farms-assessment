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

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: env.SHOPIFY_STORE_DOMAIN,
        path: urlPath,
        method,
        headers: {
          "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(JSON.parse(raw || "{}")));
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const handles = [
    "shop-all",
    "vegetables",
    "flowers",
    "herbs-microgreens",
    "featured-harvest",
  ];
  for (const h of handles) {
    const res = await request("POST", "/admin/api/2024-10/graphql.json", {
      query: `{ collectionByHandle(handle: "${h}") { title handle productsCount { count } } }`,
    });
    console.log(h, res.data?.collectionByHandle);
  }
  const idx = await request(
    "GET",
    `/admin/api/2024-10/themes/198425739633/assets.json?asset[key]=${encodeURIComponent("templates/index.json")}`
  );
  const j = JSON.parse(idx.asset.value);
  console.log("order", j.order.join(" | "));
  console.log(
    "featured collection",
    j.sections.product_list_fa6P9H?.settings?.collection
  );
  console.log(
    "category list",
    j.sections.tt_collections?.settings?.collection_list
  );
})().catch(console.error);
