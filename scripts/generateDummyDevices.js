/**
 * Dummy Device and Channel Generation Script
 * 
 * Creates realistic devices and channels for testing alarm analytics.
 * This must be run before generateDummyData.js
 * 
 * Run: node scripts/generateDummyDevices.js
 */

const { Device, Site, Channel, AlarmLog, AlarmAction, sequelize } = require("../models");

// Configuration
const CONFIG = {
  siteCount: 3,
  devicesPerSite: 2,
  channelsPerDevice: 72
};

// Helper: Random integer
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: Random item from array
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function generateDummyDevices() {
  console.log("🚀 Starting dummy device and channel generation...\n");

  try {
    // Check existing data
    const existingDevices = await Device.count();
    if (existingDevices > 0) {
      console.log(`⚠️  Found ${existingDevices} existing devices`);
      console.log("   Clearing existing devices, channels, and related data...\n");
      // Delete in correct order to respect foreign key constraints
      await AlarmAction.destroy({ where: {} });
      await AlarmLog.destroy({ where: {} });
      await Channel.destroy({ where: {} });
      await Device.destroy({ where: {} });
      await Site.destroy({ where: {} });
    }

    // Generate sites
    console.log("📍 Generating sites...");
    const siteNames = ['Substation A', 'Substation B', 'Substation C', 'Substation D', 'Substation E'];
    const locations = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central Zone'];
    
    const sites = [];
    for (let i = 0; i < CONFIG.siteCount; i++) {
      const site = await Site.create({
        site_name: siteNames[i] || `Site ${i + 1}`,
        location: locations[i] || `Location ${i + 1}`,
        status: 'ACTIVE',
        created_by: 'TEST_SCRIPT',
        updated_by: 'TEST_SCRIPT'
      });
      sites.push(site);
      console.log(`   Created site: ${site.site_name}`);
    }

    console.log(`✅ Created ${sites.length} sites\n`);

    // Generate devices
    console.log("🔧 Generating devices...");
    const devices = [];
    let deviceIdCounter = 1;

    for (const site of sites) {
      for (let i = 0; i < CONFIG.devicesPerSite; i++) {
        const device = await Device.create({
          site_id: site.site_id,
          hardware_uid: `DEV-${site.site_name.substring(0, 3).toUpperCase()}-${String(deviceIdCounter).padStart(4, '0')}`,
          device_name: `Annunciator Panel ${deviceIdCounter}`,
          gsm_number: `+91${randomInt(7000000000, 9999999999)}`,
          imei_number: `IMEI-${randomInt(100000000000000, 999999999999999)}`,
          ip_address: `192.168.1.${randomInt(10, 250)}`,
          connection_status: randomItem(['ONLINE', 'OFFLINE']),
          last_heartbeat: new Date(),
          power_source: randomItem(['AC', 'BATTERY']),
          battery_percentage: randomInt(10, 100),
          firmware_version: '1.0.0',
          created_by: 'TEST_SCRIPT',
          updated_by: 'TEST_SCRIPT'
        });
        devices.push(device);
        console.log(`   Created device: ${device.device_name} at ${site.site_name}`);
        deviceIdCounter++;
      }
    }

    console.log(`✅ Created ${devices.length} devices\n`);

    // Generate channels
    console.log("📡 Generating channels...");
    const channels = [];
    let channelCounter = 1;

    for (const device of devices) {
      for (let i = 1; i <= CONFIG.channelsPerDevice; i++) {
        const channel = await Channel.create({
          device_id: device.device_id,
          channel_number: i,
          label: `Channel ${i} - ${getRandomChannelLabel(i)}`,
          priority: getChannelPriority(i),
          input_type: randomItem(['NO', 'NC']),
          delay_ms: randomInt(0, 5000),
          blink_pattern: 'NORMAL',
          is_enabled: true,
          created_by: 'TEST_SCRIPT',
          updated_by: 'TEST_SCRIPT'
        });
        channels.push(channel);
      }
      console.log(`   Created ${CONFIG.channelsPerDevice} channels for ${device.device_name}`);
    }

    console.log(`✅ Created ${channels.length} channels\n`);

    // Summary
    console.log("📊 GENERATION SUMMARY");
    console.log("════════════════════════════════════════");
    console.log(`Total Sites: ${sites.length}`);
    console.log(`Total Devices: ${devices.length}`);
    console.log(`Total Channels: ${channels.length}`);
    console.log("════════════════════════════════════════\n");

    console.log("✅ Dummy devices and channels generated successfully!");
    console.log("🎯 Now run: node scripts/generateDummyData.js\n");

    process.exit(0);

  } catch (error) {
    console.error("❌ Error generating dummy devices:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Helper: Get realistic channel label based on channel number
function getRandomChannelLabel(channelNumber) {
  const labels = [
    'Temperature High', 'Temperature Low', 'Pressure High', 'Pressure Low',
    'Flow High', 'Flow Low', 'Level High', 'Level Low',
    'Voltage High', 'Voltage Low', 'Current High', 'Current Low',
    'Frequency High', 'Frequency Low', 'Power Factor Low',
    'Overload', 'Short Circuit', 'Earth Fault',
    'Cooling System Failure', 'Pump Failure', 'Fan Failure',
    'Door Open', 'Fire Alarm', 'Smoke Detected',
    'Humidity High', 'Humidity Low', 'Vibration High',
    'Oil Level Low', 'Gas Leakage', 'Phase Failure'
  ];
  
  // Use channel number to deterministically select label
  return labels[(channelNumber - 1) % labels.length];
}

// Helper: Get priority based on channel number (simulate real scenarios)
function getChannelPriority(channelNumber) {
  // First 10 channels are often critical
  if (channelNumber <= 10) return 'CRITICAL';
  // Channels 11-40 are warnings
  if (channelNumber <= 40) return 'WARNING';
  // Rest are info
  return 'INFO';
}

// Run the script
generateDummyDevices();
