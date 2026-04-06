const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const wordLookupController = require('../controllers/wordLookupController');

// All routes require authentication
router.use(authenticate);

router.get('/cache', wordLookupController.getCache);
router.post('/cache', wordLookupController.addToCache);
router.delete('/cache/:word', wordLookupController.deleteFromCache);
router.delete('/cache', wordLookupController.clearCache);

module.exports = router;
