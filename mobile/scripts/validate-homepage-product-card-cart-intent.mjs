import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const homePath = path.join(root, "app", "index.tsx");
const discoveryPath = path.join(root, "app", "customer", "discover.tsx");

const home = fs.readFileSync(homePath, "utf8");
const discovery = fs.readFileSync(discoveryPath, "utf8");

function assertContains(label, text, pattern) {
  if (!pattern.test(text)) {
    throw new Error(`Missing homepage product-card check: ${label}`);
  }
}

assertContains("variant model", home, /SHOWCASE_PRODUCT_VARIANTS/);
assertContains("500g variant", home, /key:\s*"500g"[\s\S]*?price:\s*20/);
assertContains("1kg variant", home, /key:\s*"1kg"[\s\S]*?price:\s*38/);
assertContains("selected variant state", home, /showcaseVariantKey/);
assertContains("variant button handler", home, /selectShowcaseVariant\(variant\.key\)/);
assertContains("dynamic price", home, /selectedShowcaseVariant\.price/);
assertContains("dynamic unit price", home, /selectedShowcaseVariant\.unitPriceLabel/);
assertContains("pending cart intent", home, /sabsewa_pending_customer_cart_intent/);
assertContains("pending variant route param", home, /pendingVariant:\s*selectedShowcaseVariant\.label/);
assertContains("product image action", home, /handleShowcaseProductSelect/);
assertContains("quantity controls", home, /showcaseQtyControl/);
assertContains("view cart action", home, /openShowcaseCart/);
assertContains("discovery route uses params", discovery, /useLocalSearchParams/);
assertContains("discovery preserves selected variant", discovery, /pendingVariant/);
assertContains("discovery preserves selected price", discovery, /pendingPrice/);

console.log("Homepage product-card cart intent validation passed.");
