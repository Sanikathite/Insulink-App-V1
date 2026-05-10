const roleRouter = require("../routes/role.routes");
const usersRouter = require("../routes/user.routes");
const accessRouter = require("../routes/access.routes");
const roleAccessRelationRouter = require("../routes/roleaccessrelation.routes");
const setupDataRouter = require("../routes/setupdataupload.routes");
const siteRouter = require("../routes/site.routes");
const dashboardRouter = require("../routes/dashboard.routes");
const configRouter = require("../routes/config.routes");
const analyticsRouter = require("../routes/analytics.routes");
const { createAlarmPushPoller } = require("../workers/alarmPushPoller.worker");
const analyticsRouter = require("../routes/analytics");

module.exports = (app) => {
  app.use("/setupdata", setupDataRouter);
  app.use("/role", roleRouter);
  app.use("/roles", roleRouter);
  app.use("/sites", siteRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/config", configRouter);
  app.use("/users", usersRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/access", accessRouter);
  app.use("/roleaccessrelations", roleAccessRelationRouter);
  app.use("/analytics", analyticsRouter);

  if (!app.locals.alarmPushPoller) {
    app.locals.alarmPushPoller = createAlarmPushPoller();
    app.locals.alarmPushPoller.start();
  }
};
