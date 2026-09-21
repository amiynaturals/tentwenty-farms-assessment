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
const PUB = "gid://shopify/Publication/368775332209";
const catalog = JSON.parse(
  fs.readFileSync("D:/10twenty/shopify/catalog-summary.json", "utf8")
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

function gql(query, variables) {
  return request("POST", "/admin/api/2024-10/graphql.json", {
    query,
    variables,
  });
}

async function getAsset(key) {
  const enc = encodeURIComponent(key);
  const a = await request(
    "GET",
    `/admin/api/2024-10/themes/${THEME}/assets.json?asset[key]=${enc}`
  );
  return a.asset.value;
}

async function putAsset(key, value) {
  await request("PUT", `/admin/api/2024-10/themes/${THEME}/assets.json`, {
    asset: { key, value },
  });
  console.log("PUT", key);
}

async function publishAll() {
  for (const p of catalog.products) {
    const id = `gid://shopify/Product/${p.id}`;
    const res = await gql(
      `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { message }
        }
      }`,
      { id, input: [{ publicationId: PUB }] }
    );
    const err = res.data?.publishablePublish?.userErrors;
    if (err?.length) console.log("publish err", p.title, err);
    else console.log("published", p.title);
  }
  for (const c of Object.values(catalog.collections)) {
    const id = `gid://shopify/Collection/${c.id}`;
    const res = await gql(
      `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { message }
        }
      }`,
      { id, input: [{ publicationId: PUB }] }
    );
    const err = res.data?.publishablePublish?.userErrors;
    if (err?.length) console.log("publish col err", c.title, err);
    else console.log("published col", c.title);
  }
}

async function updateMenu() {
  const menuId = "gid://shopify/Menu/331354571121";
  const items = [
    { title: "Home", type: "FRONTPAGE", url: "/" },
    {
      title: "Shop All",
      type: "COLLECTION",
      resourceId: `gid://shopify/Collection/${catalog.collections.all.id}`,
    },
    {
      title: "Vegetables",
      type: "COLLECTION",
      resourceId: `gid://shopify/Collection/${catalog.collections.vegetables.id}`,
    },
    {
      title: "Flowers",
      type: "COLLECTION",
      resourceId: `gid://shopify/Collection/${catalog.collections.flowers.id}`,
    },
    {
      title: "Herbs",
      type: "COLLECTION",
      resourceId: `gid://shopify/Collection/${catalog.collections.herbs.id}`,
    },
    {
      title: "Featured",
      type: "COLLECTION",
      resourceId: `gid://shopify/Collection/${catalog.collections.featured.id}`,
    },
  ];
  const res = await gql(
    `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { handle items { title url } }
        userErrors { field message }
      }
    }`,
    { id: menuId, title: "Main menu", items }
  );
  console.log("menu", JSON.stringify(res.data?.menuUpdate || res, null, 2));
}

async function updateIndex() {
  const raw = await getAsset("templates/index.json");
  const index = JSON.parse(raw);

  if (index.sections.product_list_fa6P9H) {
    index.sections.product_list_fa6P9H.settings.collection =
      "featured-harvest";
    index.sections.product_list_fa6P9H.settings.max_products = 8;
    if (
      index.sections.product_list_fa6P9H.blocks?.["static-header"]?.blocks
        ?.product_list_text_YFtzcL
    ) {
      index.sections.product_list_fa6P9H.blocks[
        "static-header"
      ].blocks.product_list_text_YFtzcL.settings.text =
        "<h3>Featured Harvest</h3>";
    }
    if (
      index.sections.product_list_fa6P9H.blocks?.["static-header"]?.blocks
        ?.product_list_button_MWeP9V
    ) {
      index.sections.product_list_fa6P9H.blocks[
        "static-header"
      ].blocks.product_list_button_MWeP9V.settings.label = "Shop all";
    }
  }

  index.sections.tt_collections = {
    type: "collection-list",
    name: "Shop by category",
    blocks: {},
    block_order: [],
    settings: {
      collection_list: [
        "vegetables",
        "flowers",
        "herbs-microgreens",
        "shop-all",
      ],
      layout_type: "grid",
      carousel_on_mobile: false,
      columns: 4,
      mobile_columns: "2",
      columns_gap: 12,
      rows_gap: 12,
      section_width: "page-width",
      background_color: "{{ settings.color_palette.background }}",
      "padding-block-start": 40,
      "padding-block-end": 40,
    },
  };

  index.order = [
    "tt_farms_banner",
    "tt_quality_products",
    "tt_collections",
    "product_list_fa6P9H",
  ].filter((k) => index.sections[k]);

  await putAsset("templates/index.json", JSON.stringify(index, null, 2));
}

async function updateHeader() {
  const raw = await getAsset("sections/header-group.json");
  const header = JSON.parse(raw);
  const ann =
    header.sections?.header_announcements_9jGBFp?.blocks?.announcement_BxgCk9;
  if (ann) {
    ann.settings.text =
      "Fresh from TenTwenty Farms — free farm-gate pickup on orders over ₹999";
  }
  await putAsset(
    "sections/header-group.json",
    JSON.stringify(header, null, 2)
  );
}

async function uploadCleanAssets() {
  const files = [
    ["assets/tentwenty-farms-banner.js", "D:/10twenty/shopify/assets/tentwenty-farms-banner.js"],
    ["assets/tentwenty-quality.js", "D:/10twenty/shopify/assets/tentwenty-quality.js"],
    ["assets/text-reveal.js", "D:/10twenty/shopify/assets/text-reveal.js"],
    ["assets/tentwenty-farms-banner.css", "D:/10twenty/shopify/assets/tentwenty-farms-banner.css"],
    ["assets/tentwenty-quality.css", "D:/10twenty/shopify/assets/tentwenty-quality.css"],
    ["assets/text-reveal.css", "D:/10twenty/shopify/assets/text-reveal.css"],
    ["sections/tentwenty-farms-banner.liquid", "D:/10twenty/shopify/sections/tentwenty-farms-banner.liquid"],
    ["sections/tentwenty-quality.liquid", "D:/10twenty/shopify/sections/tentwenty-quality.liquid"],
  ];
  for (const [key, file] of files) {
    if (!fs.existsSync(file)) continue;
    await putAsset(key, fs.readFileSync(file, "utf8"));
  }
}

async function main() {
  const skipPublish = process.argv.includes("--skip-publish");
  if (!skipPublish) await publishAll();
  await updateMenu();
  await updateIndex();
  await updateHeader();
  await uploadCleanAssets();
  console.log("storefront wired");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
