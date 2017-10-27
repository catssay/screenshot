const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const { resolve, join } = path

let browser = null
let pagesOpened = 0
let timer = null
let lastRequest = new Date()
const browserExpiredIn = 30000
const maxPageOpen = 50
const cacheFolderName = 'cache'

const makeTypeChecker = type => value =>
  Object.prototype.toString.call(value) === `[object ${type}]`
const isNumber = makeTypeChecker('Number')
const isBoolean = makeTypeChecker('Boolean')
const isString = makeTypeChecker('String')
const isObject = makeTypeChecker('Object')
const oneOf = (someone, arr) => arr.indexOf(someone) !== -1
const between = (someone, min, max) => someone >= min && someone <= max

function autoDestroyBrowser() {
  if (timer) {
    return
  }
  timer = setInterval(() => {
    const now = new Date()
    const shouldClose = now.getTime() - lastRequest.getTime() > browserExpiredIn

    if (shouldClose) {
      if (browser) {
        browser
          .close()
          .then(() => {
            browser = null
          })
          .catch(e => {
            browser = null
          })
      }
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

async function getBrowser() {
  autoDestroyBrowser()

  if (browser) {
    return browser
  }

  const launchParams = {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }

  browser = await puppeteer.launch(launchParams)

  return browser
}

function checkUrl(url) {
  if (!isString(url)) {
    return { errMsg: 'url为<String>型' }
  }

  const urlReg = /^(http|https):\/\/.*$/
  const schemePass = urlReg.test(url)

  if (!schemePass) {
    return { errMsg: 'url必须包含协议<http|https>, 如: https://www.baidu.com' }
  }

  const hostLimit = ['localhost', '192.168..*', '172..*', '127.0.0.1', '10..*']

  const hostPass = hostLimit.every(regStr => {
    const hostReg = new RegExp(regStr)
    return !hostReg.test(url)
  })

  if (!hostPass) {
    return { errMsg: 'url地址非法' }
  }

  return {}
}

function checkViewport(viewport) {
  if (viewport === undefined) {
    return {}
  }

  if (!isObject(viewport)) {
    return { errMsg: 'viewport为<Object>型' }
  }

  const numProps = ['width', 'height', 'deviceScaleFactor']
  const boolProps = ['isMobile', 'hasTouch', 'isLandscape']

  for (let prop in viewport) {
    if (viewport.hasOwnProperty(prop)) {
      const value = viewport[prop]

      if (numProps.includes(prop)) {
        if (!isNumber(value)) {
          return { errMsg: `${prop}为<Number>型` }
        } else {
          return {}
        }
      } else if (boolProps.includes(prop)) {
        if (!isBoolean(value)) {
          return { errMsg: `${prop}为<Boolean>型` }
        } else {
          return {}
        }
      }

      return { errMsg: `viewport不存在${prop}属性` }
    }
  }

  return {}
}

function checkOptions(options) {
  if (options === undefined) {
    return {}
  }

  if (!isObject(options)) {
    return { errMsg: 'options为<Object>型' }
  }

  const { type, quality, fullPage, omitBackground } = options

  if (type !== undefined && !(isString(type) && oneOf(type, ['png', 'jpeg']))) {
    return { errMsg: 'type为png或jpeg' }
  }

  if (
    quality !== undefined &&
    !(isNumber(quality) && between(quality, 1, 100))
  ) {
    return { errMsg: 'quality为<Number>型,且大于等于1小于等于100' }
  }

  if (fullPage !== undefined && !isBoolean(fullPage)) {
    return { errMsg: 'fullPage为<Boolean>型' }
  }

  if (omitBackground !== undefined && !isBoolean(omitBackground)) {
    return { errMsg: 'omitBackground为<Boolean>型' }
  }

  return { options: { type, quality, fullPage, omitBackground } }
}

function getFilename() {
  const name =
    Date.now() +
    Math.random()
      .toString()
      .replace('.') +
    '.png'
  return resolve(join(cacheFolderName, name))
}

function removeFile(path) {
  fs.stat(path, (err, stat) => {
    if (err) return
    if (stat.isFile()) {
      fs.unlink(path, err => {
        if (err) {
          console.error(err)
        }
      })
    }
  })
}

async function screenshoot(req, res, next) {
  try {
    if (pagesOpened > maxPageOpen) {
      return res.status(400).send('并行处理资源数已达到最大限制，请稍后再试')
    }
    // lastRequest is used to determin wheather browser need to be destroyed
    lastRequest = new Date()
    const { url, viewport, options } = req.body
    const urlErrMsg = checkUrl(url).errMsg
    const vpErrMsg = checkViewport(viewport).errMsg
    const { errMsg: optErrMsg, options: opts } = checkOptions(options)
    const errMsg = urlErrMsg || vpErrMsg || optErrMsg

    if (errMsg) {
      res.set('Content-Type', 'text/plain')
      return res.status(400).send(errMsg)
    }

    const browser = await getBrowser()
    const page = await browser.newPage()
    const filename = getFilename()

    ++pagesOpened
    await page.goto(url)

    if (viewport !== undefined) {
      await page.setViewport(viewport)
    }

    await page.screenshot(Object.assign({ path: filename }, opts)).then(() => {
      res.sendFile(filename, {}, err => {
        removeFile(filename)
      })
    })
    await page.close().then(() => {
      --pagesOpened
    })
  } catch (e) {
    res.status(500).send(e.message)
  }
}

module.exports = screenshoot
