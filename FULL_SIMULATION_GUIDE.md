# Full Simulation Guide - Analytics Module

This guide provides a complete step-by-step simulation of the Analytics Module implementation from scratch. Use this to demonstrate the entire system to your friend.

## Prerequisites

- Node.js and npm installed
- MySQL database running
- `.env` file configured with database credentials
- Postman or similar API testing tool

---

## Step 1: Clean Database (Optional)

If you want to start from a completely fresh database:

```bash
# Connect to MySQL
mysql -u root -p

# Drop and recreate the database
DROP DATABASE IF EXISTS insulink_db2;
CREATE DATABASE insulink_db2;

# Exit MySQL
exit;
```

---

## Step 2: Seed Access Modules

Run the seed script to insert all default access modules:

```bash
cd c:\Users\admin\Desktop\Insulink 2.0\Insulink-App-V1
node scripts/seedAccessModules.js
```

**Expected Output:**
```
🌱 Starting access modules seed...
✅ Access modules seed completed successfully!
🎯 You can now assign these access modules to roles via /roleaccessrelations
```

**What this does:**
- Creates 8 access modules: USER_MASTER, ROLE_MASTER, ROLE_ACCESS, ACCESS, ANALYTICS, DEVICE, SITE, CHANNEL
- These modules control RBAC permissions in the system

---

## Step 3: Generate Dummy Devices and Channels

Create the infrastructure (sites, devices, channels) for testing:

```bash
node scripts/generateDummyDevices.js
```

**Expected Output:**
```
🏗️  Generating dummy sites, devices, and channels...
✅ Generated 3 sites
✅ Generated 6 devices
✅ Generated 432 channels
🎉 Dummy device generation completed successfully!
```

**What this creates:**
- 3 sites (Substation A, B, C)
- 6 devices (Annunciator Panels 1-6)
- 432 channels (72 per device)

---

## Step 4: Generate Dummy Alarm Data

Create realistic alarm logs and actions:

```bash
node scripts/generateDummyData.js
```

**Expected Output:**
```
📊 Generating dummy alarm data...
✅ Generated 1500 alarm logs
✅ Generated 2088 alarm actions
🎉 Dummy data generation completed successfully!
```

**What this creates:**
- 1500 alarm logs with various statuses (ACTIVE, ACKNOWLEDGED, RESET)
- 2088 alarm actions (ACKNOWLEDGE, RESET, MUTE, TEST)
- Realistic timestamps spanning 10 days
- Various severity levels (CRITICAL, WARNING, INFO)

---

## Step 5: Start the Server

Start the Express server:

```bash
npm start
```

**Expected Output:**
```
Server is running on port http://localhost:3000 🚀.
```

Keep this terminal open and running.

---

## Step 6: Login and Get JWT Token

Open Postman and make a login request:

**Request:**
- **Method:** POST
- **URL:** `http://localhost:3000/users/sign-in`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "name": "Test User",
  "password": "Test@123"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": 1,
      "name": "Test User",
      "role_id": 1
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Copy the token** - you'll need it for all subsequent requests.

---

## Step 7: Assign ANALYTICS Access to Role

Now assign the ANALYTICS access module to a role so the user can access analytics endpoints.

**Request:**
- **Method:** POST
- **URL:** `http://localhost:3000/roleaccessrelations`
- **Headers:**
  - `Authorization: Bearer <your_token>`
  - `Content-Type: application/json`
- **Body:**
```json
{
  "roleId": 1,
  "accessData": [
    {
      "key": "ANALYTICS",
      "canView": true,
      "canCreate": false,
      "canUpdate": false,
      "canDelete": false
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "role_id": 1,
    "access_id": 5,
    "can_view": true,
    "can_create": false,
    "can_update": false,
    "can_delete": false
  }
}
```

---

## Step 8: Test Analytics Endpoints

Now test all 5 analytics endpoints with your JWT token.

### Endpoint 1: Alarm Frequency

**Request:**
- **Method:** GET
- **URL:** `http://localhost:3000/analytics/frequency`
- **Headers:** `Authorization: Bearer <your_token>`

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "device_id": 13,
      "site_id": 7,
      "device_name": "Annunciator Panel 1",
      "alarm_count": 251
    },
    {
      "device_id": 14,
      "site_id": 7,
      "device_name": "Annunciator Panel 2",
      "alarm_count": 229
    }
  ]
}
```

**What this shows:**
- Total alarm count per device
- Useful for identifying which devices have the most issues

---

### Endpoint 2: MTTR/MTTA

**Request:**
- **Method:** GET
- **URL:** `http://localhost:3000/analytics/mttr-mtta`
- **Headers:** `Authorization: Bearer <your_token>`

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "device_id": 13,
      "device_name": "Annunciator Panel 1",
      "site_id": 7,
      "site_name": "Substation A",
      "total_alarms": 251,
      "acknowledged_alarms": 213,
      "reset_alarms": 144,
      "mtta_seconds": 150.75,
      "mttr_seconds": 481.64,
      "mtta_formatted": "2m 30s",
      "mttr_formatted": "8m 1s"
    }
  ]
}
```

**What this shows:**
- MTTA (Mean Time To Acknowledge): Average time from fault to first acknowledge
- MTTR (Mean Time To Resolve): Average time from fault to last reset
- Performance metrics for each device

---

### Endpoint 3: Repeated Alarms

**Request:**
- **Method:** GET
- **URL:** `http://localhost:3000/analytics/repeated-alarms?startTime=2026-04-09&endTime=2026-04-19`
- **Headers:** `Authorization: Bearer <your_token>`

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "channel_id": 1,
      "channel_number": 1,
      "label": "Channel 1",
      "device_id": 13,
      "device_name": "Annunciator Panel 1",
      "site_id": 7,
      "site_name": "Substation A",
      "alarm_count": 15,
      "severity_distribution": {
        "CRITICAL": 8,
        "WARNING": 5,
        "INFO": 2
      },
      "alarms": [
        {
          "alarm_id": 1,
          "severity": "CRITICAL",
          "fault_at": "2026-04-09T10:30:00.000Z"
        }
      ]
    }
  ]
}
```

**What this shows:**
- Channels with repeated alarm occurrences
- Helps identify problematic channels that need attention

---

### Endpoint 4: Anomaly Detection

**Request:**
- **Method:** GET
- **URL:** `http://localhost:3000/analytics/anomalies`
- **Headers:** `Authorization: Bearer <your_token>`

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "anomaly_detected": false,
    "average_daily_alarms": 145,
    "today_alarm_count": 53,
    "threshold": 217,
    "percentage_increase": -63,
    "daily_counts": [
      {
        "date": "2026-04-09",
        "count": 46
      },
      {
        "date": "2026-04-10",
        "count": 84
      }
    ],
    "message": "No anomaly detected: Alarm count is within normal range"
  }
}
```

**What this shows:**
- Statistical analysis of alarm patterns
- Detects abnormal spikes using z-score method
- Daily alarm counts for trend analysis

---

### Endpoint 5: Device Health

**Request:**
- **Method:** GET
- **URL:** `http://localhost:3000/analytics/device-health`
- **Headers:** `Authorization: Bearer <your_token>`

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "device_id": 13,
      "device_name": "Annunciator Panel 1",
      "site_id": 7,
      "site_name": "Substation A",
      "connection_status": "OFFLINE",
      "battery_percentage": 51,
      "health_score": 17,
      "status": "Critical",
      "metrics": {
        "alarm_count_7days": 197,
        "severity_distribution": {
          "CRITICAL": 68,
          "WARNING": 66,
          "INFO": 63
        },
        "avg_mttr_seconds": 481.64,
        "avg_mttr_formatted": "8m 1s"
      }
    }
  ]
}
```

**What this shows:**
- Overall health score (0-100) for each device
- Status categories: Excellent, Good, Fair, Poor, Critical
- Based on alarm frequency, severity, MTTR, and system health

---

## Step 9: Export Data (Optional)

Export the dummy data to JSON format:

```bash
node scripts/exportDummyData.js
```

**Expected Output:**
```
📦 Starting dummy data export...
✅ Exported 3 sites
✅ Exported 6 devices
✅ Exported 432 channels
✅ Exported 1500 alarm logs
✅ Exported 2088 alarm actions
📂 Files saved to: C:\Users\admin\Desktop\Insulink 2.0\Insulink-App-V1\dummy-data-export
```

---

## Summary of What Was Demonstrated

### Infrastructure Setup
- ✅ Database with access modules (RBAC)
- ✅ 3 sites, 6 devices, 432 channels
- ✅ 1500 alarm logs, 2088 alarm actions

### Security
- ✅ JWT authentication
- ✅ RBAC authorization with ANALYTICS access

### Analytics Capabilities
- ✅ Alarm frequency analysis per device
- ✅ MTTA/MTTR performance metrics
- ✅ Repeated alarm detection
- ✅ Anomaly detection with statistical analysis
- ✅ Device health scoring

### Data Management
- ✅ Dummy data generation
- ✅ JSON export functionality

---

## Quick Reference

### Important Files
- `services/analytics.service.js` - Analytics business logic
- `controllers/analytics.controller.js` - Request handling
- `routes/analytics.routes.js` - API endpoints
- `scripts/seedAccessModules.js` - Access modules seeder
- `scripts/generateDummyDevices.js` - Device data generator
- `scripts/generateDummyData.js` - Alarm data generator
- `scripts/exportDummyData.js` - JSON export script

### Database Tables
- `access` - Access module definitions
- `roleaccessrelations` - Role-access permissions
- `sites` - Physical locations
- `devices` - Annunciator panels
- `channels` - Input channels
- `alarm_logs` - Alarm events
- `alarm_actions` - User actions

### API Endpoints
- `GET /analytics/frequency` - Alarm counts per device
- `GET /analytics/mttr-mtta` - Performance metrics
- `GET /analytics/repeated-alarms` - Repeated pattern detection
- `GET /analytics/anomalies` - Anomaly detection
- `GET /analytics/device-health` - Health scores

---

## Troubleshooting

### Issue: "Access denied" error
**Solution:** Ensure you've assigned ANALYTICS access to the role using Step 7.

### Issue: Empty responses
**Solution:** Ensure dummy data is generated using Steps 3 and 4.

### Issue: Server won't start
**Solution:** Check database connection in `.env` file and ensure MySQL is running.

---

## Demonstration Tips

1. **Show the code:** Open the analytics service file to show the logic
2. **Explain RBAC:** Show how access modules control permissions
3. **Test filters:** Use query parameters like `device_id` to show filtering
4. **Compare devices:** Show how different devices have different metrics
5. **Explain scores:** Explain how device health scores are calculated

---

## Conclusion

This simulation demonstrates a complete, production-ready Analytics Module for the Insulink 2.0 Alarm Annunciator System. It includes:
- 5 analytics endpoints
- RBAC security integration
- Realistic dummy data
- Comprehensive documentation
- Export functionality

The system is ready for deployment and further enhancement.
