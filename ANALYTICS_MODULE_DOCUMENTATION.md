# Analytics Module Documentation

## Overview

The Analytics Module provides comprehensive data analytics for the Insulink 2.0 Alarm Annunciator System. It enables monitoring of alarm patterns, device performance, and operational metrics through a RESTful API.

## Features

- **Alarm Frequency Analysis**: Track alarm counts per device/site over time
- **MTTR/MTTA Calculation**: Measure Mean Time To Resolve and Mean Time To Acknowledge
- **Repeated Alarm Detection**: Identify channels with frequent alarm occurrences
- **Anomaly Detection**: Detect abnormal alarm spikes using statistical analysis
- **Device Health Scoring**: Compute overall health scores for devices based on multiple metrics

## Architecture

The module follows the existing layered architecture:

```
routes/analytics.routes.js → controllers/analytics.controller.js → services/analytics.service.js → models
```

### Middleware Integration

All analytics endpoints are protected with:
- JWT Authentication (`auth.loginRequired`)
- RBAC Authorization (`checkAccess({ accessKey: "ANALYTICS" })`)

## API Endpoints

### 1. Alarm Frequency

**Endpoint:** `GET /analytics/frequency`

**Description:** Returns alarm count per device with optional filtering

**Query Parameters:**
- `device_id` (optional): Filter by specific device
- `site_id` (optional): Filter by specific site
- `startDate` (optional): Start date for filtering (YYYY-MM-DD)
- `endDate` (optional): End date for filtering (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "device_id": 13,
      "site_id": 7,
      "device_name": "Annunciator Panel 1",
      "alarm_count": 251
    }
  ]
}
```

### 2. MTTR/MTTA

**Endpoint:** `GET /analytics/mttr-mtta`

**Description:** Calculates Mean Time To Resolve (MTTR) and Mean Time To Acknowledge (MTTA) per device

**Query Parameters:**
- `device_id` (optional): Filter by specific device
- `site_id` (optional): Filter by specific site
- `startDate` (optional): Start date for filtering
- `endDate` (optional): End date for filtering

**Response:**
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

### 3. Repeated Alarms

**Endpoint:** `GET /analytics/repeated-alarms`

**Description:** Detects channels with repeated alarms in a specified time window

**Query Parameters:**
- `device_id` (optional): Filter by specific device
- `site_id` (optional): Filter by specific site
- `threshold` (optional): Minimum alarm count to consider as repeated (default: 5)
- `startTime` (optional): Start of time window
- `endTime` (optional): End of time window

**Note:** If no time range is provided, defaults to last 1 hour.

### 4. Anomaly Detection

**Endpoint:** `GET /analytics/anomalies`

**Description:** Detects abnormal alarm spikes using statistical analysis (z-score method)

**Query Parameters:**
- `device_id` (optional): Filter by specific device
- `site_id` (optional): Filter by specific site

**Response:**
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
      { "date": "2026-04-09", "count": 46 }
    ],
    "message": "No anomaly detected: Alarm count is within normal range"
  }
}
```

### 5. Device Health

**Endpoint:** `GET /analytics/device-health`

**Description:** Computes device health scores based on alarm frequency, severity, MTTR, and system health metrics

**Query Parameters:**
- `device_id` (optional): Filter by specific device
- `site_id` (optional): Filter by specific site

**Response:**
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

## Setup Instructions

### Prerequisites

- Node.js and npm installed
- MySQL database running
- `.env` file configured with database credentials

### Step 1: Seed Access Modules

Run the seed script to insert default access modules:

```bash
node scripts/seedAccessModules.js
```

This creates the following access modules:
- USER_MASTER
- ROLE_MASTER
- ROLE_ACCESS
- ACCESS
- ANALYTICS
- DEVICE
- SITE
- CHANNEL

### Step 2: Generate Dummy Data (Optional)

For testing purposes, generate dummy devices, channels, and alarm data:

```bash
# Generate devices and channels
node scripts/generateDummyDevices.js

# Generate alarm logs and actions
node scripts/generateDummyData.js
```

### Step 3: Assign ANALYTICS Access to Role

**Login to get JWT token:**
```bash
POST http://localhost:3000/users/sign-in
{
  "name": "your_username",
  "password": "your_password"
}
```

**Assign ANALYTICS access:**
```bash
POST http://localhost:3000/roleaccessrelations
Headers:
  Authorization: Bearer <your_jwt_token>
  Content-Type: application/json

Body:
{
  "roleId": <role_id>,
  "accessData": [
    { "key": "ANALYTICS", "canView": true }
  ]
}
```

### Step 4: Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## File Structure

### New Files Created

```
Insulink-App-V1/
├── services/
│   └── analytics.service.js          # Analytics business logic
├── controllers/
│   └── analytics.controller.js      # Request handling
├── routes/
│   └── analytics.routes.js          # API endpoints with middleware
├── scripts/
│   ├── seedAccessModules.js         # Access modules seeder
│   ├── generateDummyDevices.js      # Device/channel data generator
│   └── generateDummyData.js         # Alarm data generator
└── functions/
    └── addAnalyticsAccess.js        # ANALYTICS access module creator
```

### Modified Files

```
Insulink-App-V1/
└── app-config/
    └── routes.js                    # Added analytics router registration
```

## Database Schema

### Tables Used

- `access` - Access module definitions
- `roleaccessrelations` - Role-access permissions
- `sites` - Physical substation locations
- `devices` - Annunciator panel devices
- `channels` - Input channels per device
- `alarm_logs` - Alarm event records
- `alarm_actions` - User actions on alarms
- `system_health_logs` - Device health metrics

## Testing

### Manual Testing with Postman

1. **Login** to get JWT token
2. **Use the token** in Authorization header for all analytics requests
3. **Test each endpoint** with the URLs provided above

### Example Test Sequence

```bash
# 1. Login
POST http://localhost:3000/users/sign-in
Body: { "name": "Test User", "password": "Test@123" }

# 2. Get alarm frequency
GET http://localhost:3000/analytics/frequency
Headers: Authorization: Bearer <token>

# 3. Get MTTR/MTTA
GET http://localhost:3000/analytics/mttr-mtta
Headers: Authorization: Bearer <token>

# 4. Get anomalies
GET http://localhost:3000/analytics/anomalies
Headers: Authorization: Bearer <token>

# 5. Get device health
GET http://localhost:3000/analytics/device-health
Headers: Authorization: Bearer <token>
```

## Troubleshooting

### Issue: "Access module 'ROLE_ACCESS' not defined in DB"

**Solution:** Run the seed script to create default access modules:
```bash
node scripts/seedAccessModules.js
```

### Issue: "Cannot read properties of undefined (reading 'device')"

**Solution:** This was fixed by modifying the service to use channel lookup maps instead of nested includes. Restart the server after code changes.

### Issue: Empty response from repeated alarms endpoint

**Solution:** The endpoint defaults to last 1 hour. Use time range parameters:
```
GET http://localhost:3000/analytics/repeated-alarms?startTime=2024-04-09&endTime=2024-04-19
```

### Issue: Foreign key constraint errors during data generation

**Solution:** Ensure devices and channels exist before generating alarm data:
```bash
node scripts/generateDummyDevices.js
node scripts/generateDummyData.js
```

## Analytics Logic Details

### MTTR/MTTA Calculation

- **MTTA (Mean Time To Acknowledge):** Average time from fault to first acknowledge action
- **MTTR (Mean Time To Resolve):** Average time from fault to last reset action
- Only includes alarms with respective actions (acknowledged or reset)

### Anomaly Detection

Uses z-score statistical method:
- Calculates mean and standard deviation of daily alarm counts
- Flags anomaly if today's count exceeds mean + 2 standard deviations
- Returns daily counts for trend analysis

### Device Health Score

Computed based on:
- **Alarm Frequency (40% weight):** Inverse of 7-day alarm count
- **Severity Distribution (30% weight):** Weighted by severity (CRITICAL=3, WARNING=2, INFO=1)
- **MTTR (20% weight):** Inverse of average resolution time
- **System Health (10% weight):** Based on connection status and battery percentage

**Health Score Range:** 0-100
- 80-100: Excellent
- 60-79: Good
- 40-59: Fair
- 20-39: Poor
- 0-19: Critical

## Security Considerations

- All endpoints require JWT authentication
- RBAC middleware enforces ANALYTICS access permission
- SQL injection protection via Sequelize ORM
- No raw SQL queries (except for database mode configuration)

## Performance Considerations

- Uses Sequelize ORM for database operations
- Channel lookup maps reduce database queries
- Bulk operations used for data generation
- Consider adding pagination for large datasets in production

## Future Enhancements

- Add caching layer for frequently accessed analytics
- Implement real-time analytics via WebSocket
- Add historical trend analysis
- Create dashboard UI for visualization
- Add export functionality (CSV, PDF)
- Implement alert thresholds and notifications

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs for detailed error messages
3. Verify database connection and credentials
4. Ensure all access modules are seeded

## Version History

- **v1.0.0** (2026-04-19): Initial implementation
  - 5 analytics endpoints
  - RBAC integration
  - Dummy data generation scripts
  - Comprehensive documentation
