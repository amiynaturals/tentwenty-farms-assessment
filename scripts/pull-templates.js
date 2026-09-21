const https = require("https");
const fs = require("fs");
const path = require("path");

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

const THEME = 198425739633;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: env.SHOPIFY_STORE_DOMAIN,
          path: urlPath,
          headers: { "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN },
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(d));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on("error", reject);
  });
}

function put(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: env.SHOPIFY_STORE_DOMAIN,
        path: urlPath,
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(d));
          else resolve(JSON.parse(d));
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function getAsset(key) {
  const enc = encodeURIComponent(key);
  const a = await get(
    `/admin/api/2024-10/themes/${THEME}/assets.json?asset[key]=${enc}`
  );
  return a.asset;
}

async function putAsset(key, value) {
  await put(`/admin/api/2024-10/themes/${THEME}/assets.json`, {
    asset: { key, value },
  });
  console.log("PUT", key);
}

async function main() {
  const keys = [
    "templates/collection.json",
    "templates/index.json",
    "sections/header-group.json",
  ];
  for (const key of keys) {
    const asset = await getAsset(key);
    if (!asset) {
      console.log("missing", key);
      continue;
    }
    const out = path.join(
      "D:/10twenty/shopify",
      "_" + key.replace(/\//g, "__")
    );
    fs.writeFileSync(out, asset.value);
    console.log("got", key, asset.value.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
