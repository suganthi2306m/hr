const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  addFollowUp,
  convertLeadToCustomer,
  listFollowUps,
  updateFollowUp,
  listUpcomingFollowUps,
} = require('../controllers/leadController');

const router = express.Router();

router.use(protect);
router.get('/', listLeads);
router.post('/', createLead);
router.get('/followups', listFollowUps);
router.get('/followups/upcoming', listUpcomingFollowUps);
router.get('/:id', getLeadById);
router.put('/:id', updateLead);
router.post('/:id/convert', convertLeadToCustomer);
router.post('/:id/followups', addFollowUp);
router.put('/:id/followups/:followUpId', updateFollowUp);

module.exports = router;
