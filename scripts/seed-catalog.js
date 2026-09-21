const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

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

const DOMAIN = env.SHOPIFY_STORE_DOMAIN;
const TOKEN = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API = `/admin/api/2024-10`;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: DOMAIN,
        path: urlPath,
        method,
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw };
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${method} ${urlPath} -> ${res.statusCode} ${JSON.stringify(json)}`
              )
            );
          } else resolve(json);
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function graphql(query, variables) {
  return request("POST", `${API}/graphql.json`, { query, variables });
}

async function stagedUploadImage(filePath, filename) {
  const size = fs.statSync(filePath).size;
  const staged = await graphql(
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename,
          mimeType: "image/jpeg",
          httpMethod: "POST",
          resource: "PRODUCT_IMAGE",
          fileSize: String(size),
        },
      ],
    }
  );
  const err = staged.data.stagedUploadsCreate.userErrors;
  if (err?.length) throw new Error(JSON.stringify(err));
  const target = staged.data.stagedUploadsCreate.stagedTargets[0];

  const boundary = "----TenTwentyBoundary" + Date.now();
  const chunks = [];
  for (const p of target.parameters) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`
    );
  }
  const fileBuf = fs.readFileSync(filePath);
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
  );
  const head = Buffer.from(chunks.join(""), "utf8");
  const mid = fileBuf;
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, mid, tail]);

  const url = new URL(target.url);
  await new Promise((resolve, reject) => {
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode >= 400)
            reject(new Error(`upload ${res.statusCode} ${raw}`));
          else resolve();
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  return target.resourceUrl;
}

const productsDef = [
  {
    title: "Heritage Tomato Box",
    type: "Vegetables",
    vendor: "TenTwenty Farms",
    tags: ["category:vegetables", "color:red", "seasonal", "box"],
    body: "<p>Hand-picked heritage tomatoes grown in open fields. Rich colour, balanced acidity, and peak-season flavour.</p>",
    price: "499.00",
    compare: "599.00",
    option: { name: "Size", values: ["1 kg", "2 kg"] },
    variants: [
      { option1: "1 kg", price: "499.00", sku: "TT-TOM-1" },
      { option1: "2 kg", price: "899.00", sku: "TT-TOM-2" },
    ],
    image: "D:/10twenty/assets/slides/03.jpg",
    fname: "product-heritage-tomato.jpg",
  },
  {
    title: "Golden Acre Flowers",
    type: "Flowers",
    vendor: "TenTwenty Farms",
    tags: ["category:flowers", "color:yellow", "bouquet", "gift"],
    body: "<p>Bright field flowers from Golden Acre — ideal for bouquets and table arrangements.</p>",
    price: "799.00",
    option: { name: "Color", values: ["Yellow", "Mixed"] },
    variants: [
      { option1: "Yellow", price: "799.00", sku: "TT-FLO-Y" },
      { option1: "Mixed", price: "849.00", sku: "TT-FLO-M" },
    ],
    image: "D:/10twenty/assets/quality/03.jpg",
    fname: "product-golden-flowers.jpg",
  },
  {
    title: "Leafy Greens Bundle",
    type: "Vegetables",
    vendor: "TenTwenty Farms",
    tags: ["category:vegetables", "color:green", "bundle", "fresh"],
    body: "<p>A rotating mix of spinach, lettuce, and seasonal greens harvested the same morning.</p>",
    price: "349.00",
    option: { name: "Pack", values: ["Standard", "Family"] },
    variants: [
      { option1: "Standard", price: "349.00", sku: "TT-GRN-S" },
      { option1: "Family", price: "599.00", sku: "TT-GRN-F" },
    ],
    image: "D:/10twenty/assets/slides/01.jpg",
    fname: "product-leafy-greens.jpg",
  },
  {
    title: "Root & Stem Mix",
    type: "Vegetables",
    vendor: "TenTwenty Farms",
    tags: ["category:vegetables", "color:orange", "roots", "seasonal"],
    body: "<p>Carrots, beets, and radishes — washed, sorted, and packed for the kitchen.</p>",
    price: "429.00",
    option: { name: "Size", values: ["1 kg", "2.5 kg"] },
    variants: [
      { option1: "1 kg", price: "429.00", sku: "TT-ROOT-1" },
      { option1: "2.5 kg", price: "949.00", sku: "TT-ROOT-25" },
    ],
    image: "D:/10twenty/assets/quality/04.jpg",
    fname: "product-root-stem.jpg",
  },
  {
    title: "Open Field Microgreens",
    type: "Herbs",
    vendor: "TenTwenty Farms",
    tags: ["category:herbs", "color:green", "microgreens", "fresh"],
    body: "<p>Delicate microgreens grown under controlled light — peppery, fresh, and ready to plate.</p>",
    price: "299.00",
    option: { name: "Tray", values: ["Small", "Large"] },
    variants: [
      { option1: "Small", price: "299.00", sku: "TT-MIC-S" },
      { option1: "Large", price: "549.00", sku: "TT-MIC-L" },
    ],
    image: "D:/10twenty/assets/quality/05.jpg",
    fname: "product-microgreens.jpg",
  },
  {
    title: "Flora Delight Bouquet",
    type: "Flowers",
    vendor: "TenTwenty Farms",
    tags: ["category:flowers", "color:pink", "bouquet", "gift"],
    body: "<p>Soft seasonal blooms arranged for gifting — sourced from partner gardens.</p>",
    price: "1299.00",
    compare: "1499.00",
    option: { name: "Size", values: ["Standard", "Deluxe"] },
    variants: [
      { option1: "Standard", price: "1299.00", sku: "TT-BOU-S" },
      { option1: "Deluxe", price: "1899.00", sku: "TT-BOU-D" },
    ],
    image: "D:/10twenty/assets/quality/02.jpg",
    fname: "product-flora-bouquet.jpg",
  },
];

async function createProduct(def) {
  const b64 = fs.readFileSync(def.image).toString("base64");
  const product = {
    title: def.title,
    body_html: def.body,
    vendor: def.vendor,
    product_type: def.type,
    tags: def.tags.join(", "),
    status: "active",
    options: [def.option],
    variants: def.variants.map((v) => ({
      option1: v.option1,
      price: v.price,
      sku: v.sku,
      inventory_management: null,
      requires_shipping: true,
    })),
    images: [
      {
        attachment: b64,
        filename: def.fname,
      },
    ],
  };
  if (def.compare) {
    product.variants = product.variants.map((v, i) =>
      i === 0 ? { ...v, compare_at_price: def.compare } : v
    );
  }
  const res = await request("POST", `${API}/products.json`, { product });
  console.log("product", res.product.id, res.product.title);
  return res.product;
}

async function createCustomCollection(title, handle, body) {
  const res = await request("POST", `${API}/custom_collections.json`, {
    custom_collection: {
      title,
      handle,
      body_html: body,
      published: true,
      sort_order: "manual",
    },
  });
  console.log("collection", res.custom_collection.id, title);
  return res.custom_collection;
}

async function createSmartCollection(title, handle, rules, body) {
  const res = await request("POST", `${API}/smart_collections.json`, {
    smart_collection: {
      title,
      handle,
      body_html: body,
      published: true,
      rules,
      disjunctive: false,
    },
  });
  console.log("smart", res.smart_collection.id, title);
  return res.smart_collection;
}

async function collect(collectionId, productId, position) {
  await request("POST", `${API}/collects.json`, {
    collect: {
      collection_id: collectionId,
      product_id: productId,
      position,
    },
  });
}

async function main() {
  const existing = await request("GET", `${API}/products.json?limit=50`);
  if (existing.products?.length) {
    console.log("Products already exist:", existing.products.length);
  }

  const created = [];
  for (const def of productsDef) {
    const found = existing.products?.find((p) => p.title === def.title);
    if (found) {
      console.log("skip existing", found.title);
      created.push(found);
      continue;
    }
    created.push(await createProduct(def));
  }

  const cols = {};
  const listCustom = await request("GET", `${API}/custom_collections.json`);
  const listSmart = await request("GET", `${API}/smart_collections.json`);

  async function ensureCustom(title, handle, body) {
    const hit = listCustom.custom_collections?.find((c) => c.handle === handle);
    if (hit) return hit;
    return createCustomCollection(title, handle, body);
  }
  async function ensureSmart(title, handle, rules, body) {
    const hit = listSmart.smart_collections?.find((c) => c.handle === handle);
    if (hit) return hit;
    return createSmartCollection(title, handle, rules, body);
  }

  cols.featured = await ensureCustom(
    "Featured Harvest",
    "featured-harvest",
    "<p>Seasonal picks from TenTwenty Farms — updated as fields turn over.</p>"
  );
  cols.vegetables = await ensureSmart(
    "Vegetables",
    "vegetables",
    [{ column: "type", relation: "equals", condition: "Vegetables" }],
    "<p>Field vegetables packed for freshness.</p>"
  );
  cols.flowers = await ensureSmart(
    "Flowers",
    "flowers",
    [{ column: "type", relation: "equals", condition: "Flowers" }],
    "<p>Blooms and bouquets from partner gardens and open fields.</p>"
  );
  cols.herbs = await ensureSmart(
    "Herbs & Microgreens",
    "herbs-microgreens",
    [{ column: "type", relation: "equals", condition: "Herbs" }],
    "<p>Herbs and microgreens for the plate.</p>"
  );
  cols.all = await ensureSmart(
    "Shop All",
    "shop-all",
    [{ column: "title", relation: "not_equals", condition: "__none__" }],
    "<p>Everything from TenTwenty Farms in one place.</p>"
  );

  const featuredIds = created.slice(0, 4).map((p) => p.id);
  const existingCollects = await request(
    "GET",
    `${API}/collects.json?collection_id=${cols.featured.id}&limit=50`
  );
  const already = new Set(
    (existingCollects.collects || []).map((c) => c.product_id)
  );
  let pos = 1;
  for (const id of featuredIds) {
    if (already.has(id)) continue;
    await collect(cols.featured.id, id, pos++);
    console.log("collect featured", id);
  }

  fs.writeFileSync(
    "D:/10twenty/shopify/catalog-summary.json",
    JSON.stringify(
      {
        products: created.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          type: p.product_type,
        })),
        collections: Object.fromEntries(
          Object.entries(cols).map(([k, c]) => [
            k,
            { id: c.id, handle: c.handle, title: c.title },
          ])
        ),
      },
      null,
      2
    )
  );
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
