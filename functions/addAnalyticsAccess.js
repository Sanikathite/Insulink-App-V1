/**
 * Script to add ANALYTICS access module to the database
 * 
 * To run this script:
 * 1. Make sure your database is running and .env is configured
 * 2. Run: node functions/addAnalyticsAccess.js
 * 
 * Alternatively, you can add it manually via API:
 * POST /access with body: { "module_code": "ANALYTICS", "module_name": "Analytics Dashboard", "description": "..." }
 */

const { Access } = require("../models");

async function addAnalyticsAccess() {
  try {
    console.log("🔍 Checking if ANALYTICS access module exists...");

    const existing = await Access.findOne({
      where: { module_code: "ANALYTICS" }
    });

    if (existing) {
      console.log("✅ ANALYTICS access module already exists");
      console.log("   Module Code:", existing.module_code);
      console.log("   Module Name:", existing.module_name);
      return;
    }

    console.log("➕ Adding ANALYTICS access module...");

    const analyticsAccess = await Access.create({
      module_code: "ANALYTICS",
      module_name: "Analytics Dashboard",
      description: "Access to analytics and reporting features including alarm frequency, MTTR/MTTA, repeated alarms, anomaly detection, and device health metrics"
    });

    console.log("✅ ANALYTICS access module added successfully!");
    console.log("   Module ID:", analyticsAccess.access_id);
    console.log("   Module Code:", analyticsAccess.module_code);
    console.log("   Module Name:", analyticsAccess.module_name);
    console.log("\n📝 Next Steps:");
    console.log("   1. Assign this access to roles via /roleaccessrelations endpoint");
    console.log("   2. Use role_id and access_id to create role-access relation");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding ANALYTICS access module:", error.message);
    process.exit(1);
  }
}

addAnalyticsAccess();
