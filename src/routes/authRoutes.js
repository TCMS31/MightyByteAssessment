'use strict';

const express = require('express');

const { login, logout, getProfile } = require('../controllers/authController');
const { authenticateToken } = require('../utils/auth');

const router = express.Router();

router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);

module.exports = router;
