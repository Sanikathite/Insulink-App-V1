/**
 * Seed Script for Default Access Modules
 * 
 * This script inserts all default access modules required for the RBAC system.
 * It is idempotent - it checks if a module exists before inserting.
 * 
 * Run: node scripts/seedAccessModules.js
 */

const { Access } = require("../models");

// Default access modules configuration
const DEFAULT_ACCESS_MODULES = [
  {
    module_code: "USER_MASTER",
    module_name: "User Management",
    description: "Full access to user management including create, read, update, delete, and bulk upload operations"
  },
  {
    module_code: "ROLE_MASTER",
    module_name: "Role Management",
    description: "Full access to role management including create, read, update, delete, status management, and bulk upload operations"
  },
  {
    module_code: "ROLE_ACCESS",
    module_name: "Role Access Management",
    description: "Manage role-access relations and permissions"
  },
  {
    module_code: "ACCESS",
    module_name: "Access Module Management",
    description: "Manage access modules including create, read, update, and delete operations"
  },
  {
    module_code: "ANALYTICS",
    module_name: "Analytics Dashboard",
    description: "Access to analytics and reporting features including alarm frequency, MTTR/MTTA, repeated alarms, anomaly detection, and device health metrics"
  },
  {
    module_code: "DEVICE",
    module_name: "Device Management",
    description: "Manage device information including create, read, update, and delete operations"
  },
  {
    module_code: "SITE",
    module_name: "Site Management",
    description: "Manage site information including create, read, update, and delete operations"
  },
  {
    module_code: "CHANNEL",
    module_name: "Channel Management",
    description: "Manage channel configurations including create, read, update, and delete operations"
  }
];

async function seedAccessModules() {
  console.log("🚀 Starting access modules seed...\n");

  try {
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const module of DEFAULT_ACCESS_MODULES) {
      try {
        // Check if module already exists
        const existing = await Access.findOne({
          where: { module_code: module.module_code }
        });

        if (existing) {
          console.log(`⏭️  Skipped: ${module.module_code} (already exists)`);
          skippedCount++;
        } else {
          // Create new module
          await Access.create(module);
          console.log(`✅ Created: ${module.module_code} - ${module.module_name}`);
          createdCount++;
        }
      } catch (error) {
        console.error(`❌ Error creating ${module.module_code}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n📊 SEED SUMMARY");
    console.log("════════════════════════════════════════");
    console.log(`Total modules processed: ${DEFAULT_ACCESS_MODULES.length}`);
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("════════════════════════════════════════\n");

    if (errorCount === 0) {
      console.log("✅ Access modules seed completed successfully!");
      console.log("🎯 You can now assign these access modules to roles via /roleaccessrelations\n");
    } else {
      console.log("⚠️  Seed completed with some errors. Please review the errors above.\n");
    }

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error("❌ Fatal error during seed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the seed
seedAccessModules();
