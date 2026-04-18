const authRoutes = require('./authRoutes');
const companyRoutes = require('./companyRoutes');
const userRoutes = require('./userRoutes');
const customerRoutes = require('./customerRoutes');
const fieldTaskRoutes = require('./fieldTaskRoutes');
const locationRoutes = require('./locationRoutes');
const visitRoutes = require('./visitRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const geofenceRoutes = require('./geofenceRoutes');
const operationsRoutes = require('./operationsRoutes');
const companyVisitRoutes = require('./companyVisitRoutes');

function registerRoutes(app) {
  app.use('/api/auth', authRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/fieldtasks', fieldTaskRoutes);
  app.use('/api/tracking', locationRoutes);
  app.use('/api/tracking/visits', visitRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/geofences', geofenceRoutes);
  app.use('/api/ops', operationsRoutes);
  app.use('/api/company-visits', companyVisitRoutes);
}

module.exports = registerRoutes;
