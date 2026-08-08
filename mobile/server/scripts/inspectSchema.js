import { supabase } from "../connection.js";

async function inspectTableSchema() {
  console.log("\n Fetching table schema details from Supabase...\n");

  // Query 1 row from master_product_catalog to inspect all keys
  const { data, error } = await supabase
    .from("master_product_catalog")
    .select("*")
    .limit(1);

  if (error) {
    console.error(" Error querying table master_product_catalog:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(" Table 'master_product_catalog' is accessible, but currently contains 0 records.");
    console.log(" Trying RPC or checking table definitions...");
  } else {
    console.log(" Table 'master_product_catalog' Columns & Data Structure:");
    console.log("-------------------------------------------------------");
    const row = data[0];
    Object.keys(row).forEach((col) => {
      const type = row[col] === null ? "null" : typeof row[col];
      console.log(` • ${col.padEnd(25)} : ${type} (Sample: ${JSON.stringify(row[col])})`);
    });
  }
}

inspectTableSchema();