#!/usr/bin/env node

'use strict'

const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')

const POSTS_DIR = path.join(__dirname, '../data/blog/')

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 800,
      height: 618,
    },
  })
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  const posts = getAllPosts()

  for (const post of posts) {
    const targetDir = path.join(__dirname, `../public/static/blog/${post}`)
    const targetImage = path.join(targetDir, '/twitter-card.png')

    if (fileExists(targetImage)) continue

    console.log('opening post', post)
    await page.goto(`http://localhost:3000/${post}`)

    console.log('waiting for network idle')
    await page.waitForNetworkIdle()

    console.log('preparing page for screenshot')
    const header = await page.$('header')
    await header.evaluate((node) => (node.style = 'visibility:hidden'))
    const datetime = await page.$('time')
    await datetime.evaluate((node) => (node.style = 'visibility:hidden'))
    const prose = await page.$('.prose')
    await prose.evaluate((node) => (node.style = 'visibility:hidden'))

    console.log('waiting for animation to progress')
    await delayRandom(1000, 2000)

    console.log('capturing screenshot')
    mkdirp.sync(targetDir)
    await page.screenshot({
      clip: {
        x: 0,
        y: 48,
        width: 800,
        height: 418,
      },
      path: targetImage,
    })

    console.log('screenshot saved to', path.relative(path.join(__dirname, '../'), targetImage))
  }

  await browser.close()
}

function getAllPosts() {
  const posts = fs
    .readdirSync(POSTS_DIR)
    .map((it) => path.join(POSTS_DIR, it))
    .filter((it) => path.extname(it) === '.md')
    .map((it) => path.basename(it, path.extname(it)))

  return posts
}

function fileExists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch (e) {
    return false
  }
}

function delayRandom(min, max) {
  const rand = Math.floor(Math.random() * (max - min + 1) + min)
  console.log(rand)
  return new Promise((resolve) => setTimeout(resolve, rand))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
