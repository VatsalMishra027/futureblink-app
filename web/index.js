// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import mongoose from "mongoose";
import Announcement from "./models/Announcement.js";

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/futureblink-app").then(() => {
  console.log("Connected to MongoDB!");
}).catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
});

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/announcements", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).send({ error: "Text is required" });
  }

  try {
    // 1. Save to MongoDB
    const announcement = new Announcement({ text });
    await announcement.save();

    // 2. Sync to Shopify Shop Metafields via GraphQL API
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    const shopRes = await client.query({
      data: {
        query: `
          query {
            shop {
              id
            }
          }
        `,
      },
    });
    const shopId = shopRes.body.data.shop.id;

    const metafieldMutation = await client.query({
      data: {
        query: `
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                key
                namespace
                value
              }
              userErrors {
                message
              }
            }
          }
        `,
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "my_app",
              key: "announcement",
              type: "single_line_text_field",
              value: text
            }
          ]
        },
      },
    });

    if (metafieldMutation.body.data.metafieldsSet.userErrors.length > 0) {
      console.error("Metafield User Errors:", metafieldMutation.body.data.metafieldsSet.userErrors);
      throw new Error(metafieldMutation.body.data.metafieldsSet.userErrors[0].message);
    }

    res.status(200).send({ success: true, announcement });
  } catch (error) {
    console.error("Failed to save announcement:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT);
