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

const THEME = 198425739633;

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
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(raw));
          else resolve(JSON.parse(raw || "{}"));
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function putAsset(key, file) {
  const value = fs.readFileSync(file, "utf8");
  await request("PUT", `/admin/api/2024-10/themes/${THEME}/assets.json`, {
    asset: { key, value },
  });
  console.log("PUT", key);
}

async function setPortraitCards() {
  for (const key of ["templates/index.json", "templates/collection.json"]) {
    const enc = encodeURIComponent(key);
    const a = await request(
      "GET",
      `/admin/api/2024-10/themes/${THEME}/assets.json?asset[key]=${enc}`
    );
    const j = JSON.parse(a.asset.value);
    const str = JSON.stringify(j);
    const next = str.replace(/"image_ratio":"adapt"/g, '"image_ratio":"portrait"');
    const next2 = next.replace(
      /"image_ratio": "adapt"/g,
      '"image_ratio": "portrait"'
    );
    await request("PUT", `/admin/api/2024-10/themes/${THEME}/assets.json`, {
      asset: { key, value: JSON.stringify(JSON.parse(next2), null, 2) },
    });
    console.log("portrait cards", key);
  }
}

(async () => {
  await putAsset(
    "assets/tentwenty-quality.js",
    "D:/10twenty/shopify/assets/tentwenty-quality.js"
  );
  await putAsset(
    "assets/tentwenty-quality.css",
    "D:/10twenty/shopify/assets/tentwenty-quality.css"
  );
  await setPortraitCards();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
