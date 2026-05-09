/**
 * Dummy Data Generation Script for Alarm Analytics Testing
 * 
 * Generates realistic alarm data for testing analytics features:
 * - Alarm frequency
 * - MTTA/MTTR calculations
 * - Repeated alarms detection
 * - Anomaly detection
 * - Device health scoring
 * 
 * Run: node scripts/generateDummyData.js
 */

const { AlarmLog, AlarmAction, Channel, Device, Site, User, Role, sequelize } = require("../models");


const { Op } = require("sequelize");
const authService = require("../services/auth.service");

/**
 * Dummy Data Generation Script for Alarm Analytics Testing
 */

const path = require('path');

// ✅ LOAD ENV FIRST (CRITICAL FIX)
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

// ✅ DEBUG (remove later if you want)
console.log("DB USER:", process.env.DB_USER);
console.log("DB PASSWORD:", process.env.DB_PASSWORD);


// Configuration
const CONFIG = {
  totalAlarms: 1500,
  daysRange: 10,
  anomalyDayOffset: 5, // Day with spike (5 days ago)
  faultyDeviceCount: 2, // Number of devices to mark as faulty
  repeatedAlarmChannels: 3 // Number of channels with repeated alarms
};

// Helper: Random integer between min and max (inclusive)
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: Random item from array
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper: Add random seconds to a date
function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

// Helper: Add random minutes to a date
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

// Helper: Add random hours to a date
function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// Helper: Generate random timestamp within date range
function randomTimestamp(startDate, endDate) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return new Date(start + Math.random() * (end - start));
}

async function generateDummyData() {
  console.log("🚀 Starting dummy data generation...\n");

  try {
    // Check existing data
    const existingAlarms = await AlarmLog.count();
    if (existingAlarms > 0) {
      console.log(`⚠️  Found ${existingAlarms} existing alarm logs`);
      console.log("   Clearing existing alarm logs and actions...\n");
      await AlarmAction.destroy({ where: {} });
      await AlarmLog.destroy({ where: {} });
    }

    // Create or get dummy user for alarm actions
    console.log("👤 Checking for dummy user...");
    let dummyUser = await User.findOne({ where: { name: 'Test User' } });
    
    if (!dummyUser) {
      console.log("   Creating dummy user...");
      // Get or create a role first
      let role = await Role.findOne({ where: { role_name: 'Test Role' } });
      if (!role) {
        role = await Role.create({
          role_name: 'Test Role',
          status: 'ACTIVE',
          created_by: 'TEST_SCRIPT',
          updated_by: 'TEST_SCRIPT'
        });
        console.log("   Created test role");
      }
      
      dummyUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        contact: '1234567890',
        password: await authService.hashPassword('Test@123'),
        role_id: role.role_id,
        account_status: 'ACTIVE',
        created_by: 'TEST_SCRIPT',
        updated_by: 'TEST_SCRIPT'
      });
      console.log("   Created dummy user");
    } else {
      console.log("   Using existing dummy user");
    }
    
    const dummyUserId = dummyUser.user_id;
    console.log(`   User ID: ${dummyUserId}\n`);

    // Fetch existing devices and channels
    console.log("📊 Fetching existing devices and channels...");
    const devices = await Device.findAll({
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['site_id', 'site_name']
        },
        {
          model: Channel,
          as: 'channels',
          attributes: ['channel_id', 'channel_number', 'label']
        }
      ]
    });

    if (devices.length === 0) {
      console.error("❌ No devices found in database. Please create devices and channels first.");
      process.exit(1);
    }

    console.log(`   Found ${devices.length} devices\n`);

    // Mark some devices as faulty
    const faultyDeviceIds = devices
      .sort(() => 0.5 - Math.random())
      .slice(0, CONFIG.faultyDeviceCount)
      .map(d => d.device_id);

    console.log(`🔧 Marked ${faultyDeviceIds.length} devices as faulty for testing`);

    // Mark some channels for repeated alarms
    const allChannels = [];
    devices.forEach(device => {
      device.channels.forEach(channel => {
        allChannels.push({
          channel_id: channel.channel_id,
          device_id: device.device_id,
          device_name: device.device_name,
          channel_number: channel.channel_number,
          label: channel.label
        });
      });
    });

    const repeatedAlarmChannelIds = allChannels
      .sort(() => 0.5 - Math.random())
      .slice(0, CONFIG.repeatedAlarmChannels)
      .map(c => c.channel_id);

    console.log(`🔄 Marked ${repeatedAlarmChannelIds.length} channels for repeated alarms\n`);

    // Date range for generation
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - CONFIG.daysRange);

    // Anomaly day (spike day)
    const anomalyDay = new Date();
    anomalyDay.setDate(anomalyDay.getDate() - CONFIG.anomalyDayOffset);
    anomalyDay.setHours(0, 0, 0, 0);
    const anomalyDayEnd = new Date(anomalyDay);
    anomalyDayEnd.setHours(23, 59, 59, 999);

    console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`⚡ Anomaly spike day: ${anomalyDay.toISOString()}\n`);

    // Generate alarm logs
    console.log("📝 Generating alarm logs...");
    const alarmLogs = [];
    const alarmActions = [];

    const severities = ['CRITICAL', 'WARNING', 'INFO'];
    const statuses = ['ACTIVE', 'ACKNOWLEDGED', 'RESET'];

    for (let i = 0; i < CONFIG.totalAlarms; i++) {
      const channel = randomItem(allChannels);
      const isFaultyDevice = faultyDeviceIds.includes(channel.device_id);
      const isRepeatedChannel = repeatedAlarmChannelIds.includes(channel.channel_id);
      
      // Determine if this alarm is on anomaly day (30% chance)
      const isAnomalyDay = Math.random() < 0.3;
      
      // Generate timestamp
      let faultAt;
      if (isAnomalyDay) {
        faultAt = randomTimestamp(anomalyDay, anomalyDayEnd);
      } else {
        faultAt = randomTimestamp(startDate, endDate);
      }

      // Determine severity based on device type
      let severity;
      if (isFaultyDevice) {
        // Faulty devices have more CRITICAL alarms
        severity = Math.random() < 0.6 ? 'CRITICAL' : randomItem(['WARNING', 'INFO']);
      } else {
        severity = randomItem(severities);
      }

      // Determine status
      const hasAcknowledge = Math.random() < 0.8;
      const hasReset = hasAcknowledge && Math.random() < 0.7;
      
      let status = 'ACTIVE';
      if (hasReset) status = 'RESET';
      else if (hasAcknowledge) status = 'ACKNOWLEDGED';

      // Create alarm log
      const alarmLog = {
        channel_id: channel.channel_id,
        severity: severity,
        status: status,
        fault_at: faultAt,
        acknowledged_at: null,
        acknowledged_by: null,
        cleared_at: null,
        reset_at: null,
        reset_by: null,
        alarm_message: `${severity} alarm on channel ${channel.channel_number} (${channel.label})`
      };

      // Calculate ACK delay
      if (hasAcknowledge) {
        let ackDelaySeconds;
        if (isFaultyDevice) {
          // Faulty devices: slow ACK (2-10 minutes)
          ackDelaySeconds = randomInt(120, 600);
        } else {
          // Normal devices: fast ACK (10 sec to 5 min)
          ackDelaySeconds = randomInt(10, 300);
        }
        alarmLog.acknowledged_at = addSeconds(faultAt, ackDelaySeconds);
        alarmLog.acknowledged_by = dummyUserId;

        // Create ACK action
        alarmActions.push({
          alarm_log_id: null, // Will be set after alarm creation
          user_id: dummyUserId,
          action_type: 'ACKNOWLEDGE',
          performed_at: alarmLog.acknowledged_at,
          remarks: 'Acknowledged via test script',
          source: 'TEST_SCRIPT'
        });
      }

      // Calculate RESET delay
      if (hasReset) {
        let resetDelayMinutes;
        if (isFaultyDevice) {
          // Faulty devices: slow RESET (10-30 minutes)
          resetDelayMinutes = randomInt(10, 30);
        } else {
          // Normal devices: fast RESET (1-10 minutes)
          resetDelayMinutes = randomInt(1, 10);
        }
        
        // Ensure RESET happens after ACK
        const baseTime = hasAcknowledge ? alarmLog.acknowledged_at : faultAt;
        alarmLog.reset_at = addMinutes(baseTime, resetDelayMinutes);
        alarmLog.reset_by = dummyUserId;
        alarmLog.cleared_at = addMinutes(faultAt, resetDelayMinutes - 1); // Cleared 1 min before reset

        // Create RESET action
        alarmActions.push({
          alarm_log_id: null, // Will be set after alarm creation
          user_id: dummyUserId,
          action_type: 'RESET',
          performed_at: alarmLog.reset_at,
          remarks: 'Reset via test script',
          source: 'TEST_SCRIPT'
        });
      }

      alarmLogs.push(alarmLog);

      // Progress indicator
      if ((i + 1) % 500 === 0) {
        console.log(`   Generated ${i + 1}/${CONFIG.totalAlarms} alarm logs...`);
      }
    }

    console.log(`   Generated ${alarmLogs.length} alarm logs\n`);

    // Insert alarm logs in bulk
    console.log("💾 Inserting alarm logs into database...");
    const createdAlarms = await AlarmLog.bulkCreate(alarmLogs, { returning: true });
    console.log(`✅ Inserted ${createdAlarms.length} alarm logs\n`);

    // Link actions to alarms
    console.log("🔗 Linking alarm actions to alarms...");
    let actionIndex = 0;
    const actionsToInsert = [];

    for (let i = 0; i < createdAlarms.length; i++) {
      const alarm = createdAlarms[i];
      
      // Check if this alarm should have ACK action
      if (alarm.acknowledged_at) {
        if (actionIndex < alarmActions.length) {
          alarmActions[actionIndex].alarm_log_id = alarm.alarm_id;
          actionsToInsert.push(alarmActions[actionIndex]);
          actionIndex++;
        }
      }

      // Check if this alarm should have RESET action
      if (alarm.reset_at) {
        if (actionIndex < alarmActions.length) {
          alarmActions[actionIndex].alarm_log_id = alarm.alarm_id;
          actionsToInsert.push(alarmActions[actionIndex]);
          actionIndex++;
        }
      }
    }

    // Insert alarm actions in bulk
    console.log("💾 Inserting alarm actions into database...");
    const createdActions = await AlarmAction.bulkCreate(actionsToInsert);
    console.log(`✅ Inserted ${createdActions.length} alarm actions\n`);

    // Summary
    console.log("📊 GENERATION SUMMARY");
    console.log("════════════════════════════════════════");
    console.log(`Total Alarms Created: ${createdAlarms.length}`);
    console.log(`Total Actions Created: ${createdActions.length}`);
    console.log(`Date Range: ${CONFIG.daysRange} days`);
    console.log(`Faulty Devices: ${faultyDeviceIds.length}`);
    console.log(`Repeated Alarm Channels: ${repeatedAlarmChannelIds.length}`);
    console.log(`Anomaly Spike Day: Day ${CONFIG.anomalyDayOffset} (from today)`);
    console.log("════════════════════════════════════════\n");

    // Distribution stats
    const severityStats = {};
    createdAlarms.forEach(a => {
      severityStats[a.severity] = (severityStats[a.severity] || 0) + 1;
    });

    console.log("📈 Severity Distribution:");
    Object.entries(severityStats).forEach(([severity, count]) => {
      const percentage = ((count / createdAlarms.length) * 100).toFixed(1);
      console.log(`   ${severity}: ${count} (${percentage}%)`);
    });

    const statusStats = {};
    createdAlarms.forEach(a => {
      statusStats[a.status] = (statusStats[a.status] || 0) + 1;
    });

    console.log("\n📋 Status Distribution:");
    Object.entries(statusStats).forEach(([status, count]) => {
      const percentage = ((count / createdAlarms.length) * 100).toFixed(1);
      console.log(`   ${status}: ${count} (${percentage}%)`);
    });

    console.log("\n✅ Dummy data generation completed successfully!");
    console.log("🎯 You can now test the analytics endpoints.\n");

    process.exit(0);

  } catch (error) {
    console.error("❌ Error generating dummy data:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
generateDummyData();
