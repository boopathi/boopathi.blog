#!/usr/bin/env node

'use strict'

const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const matter = require('gray-matter')

const POSTS_DIR = path.join(__dirname, '../data/blog/')

async function main(args) {
  let skipImageGeneration = false
  let skipPostUpdate = false
  let force = false
  for (const a of args) {
    if (a === '--skipImage') {
      skipImageGeneration = true
    } else if (a === '--skipPostUpdate') {
      skipPostUpdate = true
    } else if (a === '--force') {
      force = true
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 800,
      height: 618,
    },
  })

  const posts = getAllPosts()

  const promises = posts.map(async (post) => {
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
    const targetDir = path.join(__dirname, `../public/static/blog/${post}`)
    const targetImage = path.join(targetDir, '/twitter-card.png')
    if (fileExists(targetImage) && !force) return

    if (!skipImageGeneration) {
      await openPostInBrowser(page, post)
      await removeUnnecessaryElements(page)
      await delayRandom(1000, 2000)
      await screenshot(page, post, targetDir, targetImage)
      console.log('screenshot saved to', path.relative(path.join(__dirname, '../'), targetImage))
    }

    if (!skipPostUpdate) {
      updatePost(post)
    }
  })

  await Promise.all(promises)

  await browser.close()
}

async function openPostInBrowser(page, post) {
  await page.goto(`http://localhost:3000/${post}`)
  await page.waitForNetworkIdle()
}

async function removeUnnecessaryElements(page) {
  const header = await page.$('header')
  await header.evaluate((node) => (node.style = 'visibility:hidden'))
  const datetime = await page.$('time')
  await datetime.evaluate((node) => (node.style = 'visibility:hidden'))
  const prose = await page.$('.prose')
  await prose.evaluate((node) => (node.style = 'visibility:hidden'))
}

async function screenshot(page, post, targetDir, targetImage) {
  mkdirp.sync(targetDir)
  await page.screenshot({
    clip: { x: 0, y: 48, width: 800, height: 418 },
    path: targetImage,
  })
}

function updatePost(post, targetImage) {
  const postFile = path.join(POSTS_DIR, `${post}.md`)
  const contents = fs.readFileSync(postFile, 'utf-8')
  const frontMatter = matter(contents)
  const targetUrl = `/static/blog/${post}/twitter-card.png`
  if (frontMatter.data.images == null) {
    frontMatter.data.images = []
  }
  if (!frontMatter.data.images.includes(targetUrl)) {
    frontMatter.data.images.unshift(targetUrl)
  }
  fs.writeFileSync(postFile, matter.stringify(frontMatter.content, frontMatter.data), 'utf-8')
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
  return new Promise((resolve) => setTimeout(resolve, rand))
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e)
  process.exit(1)
})
