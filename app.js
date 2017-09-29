const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')
const router = require('./router')

const app = express()
const port = process.env.PORT || 8181

// common middleware
app.use(bodyParser.json())

// middleware

// router
app.use(router)

// launch
app.listen(port, error => {
  if (error) {
    console.error(error)
  } else {
    console.log('server listen on ' + port)
  }
})
