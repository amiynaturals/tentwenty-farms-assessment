const https = require("https");
const http = require("http");
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

const OUT = "D:/10twenty/assets/products";
fs.mkdirSync(OUT, { recursive: true });

const catalog = JSON.parse(
  fs.readFileSync("D:/10twenty/shopify/catalog-summary.json", "utf8")
);

const shots = [
  {
    handle: "heritage-tomato-box",
    file: "tomato.jpg",
    url: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&h=1200&q=85",
  },
  {
    handle: "golden-acre-flowers",
    file: "yellow-flowers.jpg",
    url: "https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=900&h=1200&q=85",
  },
  {
    handle: "leafy-greens-bundle",
    file: "greens.jpg",
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&h=1200&q=85",
  },
  {
    handle: "root-stem-mix",
    file: "roots.jpg",
    url: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&h=1200&q=85",
  },
  {
    handle: "open-field-microgreens",
    file: "microgreens.jpg",
    url: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=900&h=1200&q=85",
  },
  {
    handle: "flora-delight-bouquet",
    file: "bouquet.jpg",
    url: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=900&h=1200&q=85",
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 TenTwentyStore/1.0",
          Accept: "image/*",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          download(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} -> ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(dest, buf);
          resolve(buf);
        });
      }
    );
    req.on("error", reject);
  });
}

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
          let json;
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            return reject(new Error(raw));
          }
          if (res.statusCode >= 400)
            reject(new Error(`${method} ${urlPath} ${res.statusCode} ${raw}`));
          else resolve(json);
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  for (const shot of shots) {
    const dest = path.join(OUT, shot.file);
    console.log("download", shot.file);
    await download(shot.url, dest);
    const product = catalog.products.find((p) => p.handle === shot.handle);
    if (!product) {
      console.log("skip missing product", shot.handle);
      continue;
    }
    const existing = await request(
      "GET",
      `/admin/api/2024-10/products/${product.id}/images.json`
    );
    for (const img of existing.images || []) {
      await request(
        "DELETE",
        `/admin/api/2024-10/products/${product.id}/images/${img.id}.json`
      );
    }
    const b64 = fs.readFileSync(dest).toString("base64");
    await request("POST", `/admin/api/2024-10/products/${product.id}/images.json`, {
      image: {
        attachment: b64,
        filename: shot.file,
        position: 1,
      },
    });
    console.log("updated image", product.title);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
