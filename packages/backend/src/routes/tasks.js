const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const tasksController = require('../controllers/tasksController');

// All routes require authentication
router.use(authenticate);

router.get('/', tasksController.getTasks);
router.post('/', tasksController.createTask);
router.put('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);
router.post('/sync', tasksController.syncTasks);

module.exports = router;
