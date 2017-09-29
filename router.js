const router = require('express').Router()
const screenshot = require('./controllers/screenshot')

router.post('/screenshot', screenshot)

module.exports = router
