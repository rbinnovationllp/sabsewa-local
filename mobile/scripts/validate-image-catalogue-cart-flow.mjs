import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assertMatch(label, text, pattern) {
  if (!pattern.test(text)) {
    throw new Error(`Image catalogue cart validation failed: ${label}`);
  }
}

const discovery = read("app/customer/discover.tsx");
const cart = read("app/hyperlocal/cart.tsx");
const placeOrder = read("server/hyperlocal/placeOrder.js");
const storage = read("server/storage/s3Routes.js");
const company = read("app/company/index.tsx");
const geminiRoutes = read("server/gemini/geminiRoutes.js");
const geminiService = read("services/gemini.ts");
const geminiOrder = read("app/customer/GeminiOrder.tsx");
const masterCatalogueReview = read("app/company/MasterCatalogueReview.tsx");

assertMatch("customer cart selection model", discovery, /type CartSelection/);
assertMatch("image-selected source is recorded", discovery, /order_input_source:\s*"catalogue_image"/);
assertMatch("master product id is carried from product card", discovery, /master_product_id:\s*product\.master_product_id/);
assertMatch("vendor catalogue item id is carried", discovery, /vendor_catalogue_item_id:\s*product\.id/);
assertMatch("complete product card is selectable", discovery, /accessibilityRole="button"[\s\S]*?onPress=\{\(\) => setProductQty\(vendor, product/);
assertMatch("selected visual state is not color-only", discovery, /selectedBadge/);
assertMatch("structured cart data is passed to final cart", discovery, /cartData:\s*JSON\.stringify\(cartData\)/);

assertMatch("final cart reads structured cart values", cart, /typeof selection === "object"/);
assertMatch("final cart fetches master product id", cart, /master_product_id/);
assertMatch("final cart displays image-selection source", cart, /selectedFromProductImage/);
assertMatch("final cart allows customer item instruction", cart, /customer_note/);
assertMatch("final cart passes source to order API", cart, /order_input_source:\s*line\.order_input_source/);

assertMatch("backend validates price changes before placing order", placeOrder, /PRICE_CHANGED_CONFIRM_REQUIRED/);
assertMatch("backend preserves catalogue image source in order item", placeOrder, /order_input_source:\s*inputSource/);
assertMatch("backend stores selection snapshot in order item", placeOrder, /selection_snapshot/);

assertMatch("S3 master image upload route exists", storage, /presign-master-catalog-image/);
assertMatch("master image rights consent is required", storage, /MASTER_IMAGE_RIGHTS_TEXT/);
assertMatch("master images require optimized thumbnail", storage, /thumbnail_upload_url/);
assertMatch("master images are private-thumbnail served", storage, /master-product-images\/:image_id\/thumbnail/);
assertMatch("admin master image route is role protected", storage, /requireCompanyAdmin\("vendors\.manage"\)/);
assertMatch("Company CRM exposes master catalogue review", company, /MasterCatalogueReview/);
assertMatch("Company CRM has polished master image upload screen", masterCatalogueReview, /Choose Image and Upload/);
assertMatch("Company CRM master image screen includes rights declaration", masterCatalogueReview, /MASTER_IMAGE_RIGHTS_TEXT/);
assertMatch("Company CRM master image screen calls admin presign endpoint", masterCatalogueReview, /admin\/presign-master-catalog-image/);
assertMatch("Company CRM master image screen creates thumbnails", masterCatalogueReview, /makeThumbnail/);

assertMatch("Gemini customer product image recognition route exists", geminiRoutes, /\/order\/image-recognize/);
assertMatch("Gemini customer product image recognition is audited", geminiRoutes, /customer_unknown_product_image/);
assertMatch("Gemini customer product image recognition cannot publish catalogue images", geminiRoutes, /publication_status:\s*"not_published"/);
assertMatch("Gemini customer product image service is connected", geminiService, /recognizeCustomerProductImageWithGemini/);
assertMatch("Customer order screen has product photo suggestion action", geminiOrder, /Upload Product Photo for Suggestion/);
assertMatch("Customer order screen marks Gemini photo suggestions for review", geminiOrder, /customer_uploaded_image_gemini_suggestion|Gemini suggested item names/);

console.log("Image catalogue cart flow validation passed.");
