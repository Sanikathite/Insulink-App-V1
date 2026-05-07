const roleRouter = require("../routes/role.routes");
const usersRouter = require("../routes/user.routes");
const accessRouter = require("../routes/access.routes");
const roleAccessRelationRouter = require("../routes/roleaccessrelation.routes");
const setupDataRouter = require("../routes/setupdataupload.routes");
const siteRouter = require("../routes/site.routes");
const dashboardRouter = require("../routes/dashboard.routes");

module.exports = (app) => {
  app.use("/setupdata", setupDataRouter);

  // Canonical path
  app.use("/roles", roleRouter);
  // Legacy alias retained for compatibility
  app.use("/role", roleRouter);

  app.use("/sites", siteRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/users", usersRouter);
  app.use("/access", accessRouter);
  app.use("/roleaccessrelations", roleAccessRelationRouter);
};
