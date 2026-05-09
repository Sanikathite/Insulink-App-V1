/**
 * Export Dummy Data to JSON
 * 
 * Exports all dummy data from the database to JSON files.
 * Useful for backup, testing, or sharing data.
 * 
 * Run: node scripts/exportDummyData.js
 */

const { Site, Device, Channel, AlarmLog, AlarmAction, sequelize } = require("../models");
const fs = require('fs');
const path = require('path');

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../dummy-data-export');

async function exportDummyData() {
  console.log("📦 Starting dummy data export...\n");

  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log("📁 Created output directory:", OUTPUT_DIR);
    }

    // Export Sites
    console.log("📍 Exporting sites...");
    const sites = await Site.findAll({
      attributes: { exclude: ['created_at', 'updated_at'] }
    });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'sites.json'),
      JSON.stringify(sites, null, 2)
    );
    console.log(`   ✅ Exported ${sites.length} sites`);

    // Export Devices
    console.log("🔌 Exporting devices...");
    const devices = await Device.findAll({
      attributes: { exclude: ['created_at', 'updated_at'] }
    });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'devices.json'),
      JSON.stringify(devices, null, 2)
    );
    console.log(`   ✅ Exported ${devices.length} devices`);

    // Export Channels
    console.log("📊 Exporting channels...");
    const channels = await Channel.findAll({
      attributes: { exclude: ['created_at', 'updated_at'] }
    });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'channels.json'),
      JSON.stringify(channels, null, 2)
    );
    console.log(`   ✅ Exported ${channels.length} channels`);

    // Export Alarm Logs
    console.log("🚨 Exporting alarm logs...");
    const alarmLogs = await AlarmLog.findAll({
      attributes: { exclude: ['created_at', 'updated_at'] }
    });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'alarm_logs.json'),
      JSON.stringify(alarmLogs, null, 2)
    );
    console.log(`   ✅ Exported ${alarmLogs.length} alarm logs`);

    // Export Alarm Actions
    console.log("📝 Exporting alarm actions...");
    const alarmActions = await AlarmAction.findAll();
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'alarm_actions.json'),
      JSON.stringify(alarmActions, null, 2)
    );
    console.log(`   ✅ Exported ${alarmActions.length} alarm actions`);

    // Export combined summary
    const summary = {
      export_date: new Date().toISOString(),
      total_sites: sites.length,
      total_devices: devices.length,
      total_channels: channels.length,
      total_alarm_logs: alarmLogs.length,
      total_alarm_actions: alarmActions.length,
      date_range: {
        earliest_alarm: alarmLogs.length > 0 ? alarmLogs[alarmLogs.length - 1].fault_at : null,
        latest_alarm: alarmLogs.length > 0 ? alarmLogs[0].fault_at : null
      }
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log("\n📊 EXPORT SUMMARY");
    console.log("════════════════════════════════════════");
    console.log(`Output Directory: ${OUTPUT_DIR}`);
    console.log(`Sites: ${sites.length}`);
    console.log(`Devices: ${devices.length}`);
    console.log(`Channels: ${channels.length}`);
    console.log(`Alarm Logs: ${alarmLogs.length}`);
    console.log(`Alarm Actions: ${alarmActions.length}`);
    console.log("════════════════════════════════════════\n");

    console.log("✅ Dummy data export completed successfully!");
    console.log(`📂 Files saved to: ${OUTPUT_DIR}\n`);

    process.exit(0);

  } catch (error) {
    console.error("❌ Error during export:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the export
exportDummyData();
