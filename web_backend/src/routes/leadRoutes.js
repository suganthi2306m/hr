const express = require('express');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const {
  createLead,
  listLeads,
  getLeadById,
  updateLead,
  addFollowUp,
  listFollowUps,
  updateFollowUp,
  convertLeadToCustomer,
  getLeadReport,
  listUpcomingFollowUps,
} = require('../controllers/leadController');

const router = express.Router();

router.use(auth, authorizeRole('admin'));

router.get('/', listLeads);
router.post('/', createLead);
router.get('/report', getLeadReport);
router.get('/followups', listFollowUps);
router.get('/followups/upcoming', listUpcomingFollowUps);
router.get('/:id', getLeadById);
router.put('/:id', updateLead);
router.post('/:id/followups', addFollowUp);
router.put('/:id/followups/:followUpId', updateFollowUp);
router.post('/:id/convert', convertLeadToCustomer);

module.exports = router;
