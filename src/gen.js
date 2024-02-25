import fs from "fs";
import path from "path";
import crypto from "crypto";

import extract from "remark-extract-frontmatter";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";
import { unified } from "unified";
import puppeteer from "puppeteer";
import { parse } from "yaml";

import { generateHtml } from "./gen-html.js";

const width = 630;
const forceRegenerate = true;
const root = "";
const outputDir = "./img";

const markdownFiles = [];

function getFileChecksum(filePath) {
  const f = fs.readFileSync(filePath, "utf-8");
  return crypto.createHash("md5").update(f).digest("hex");
}

async function getMarkdownFiles(filePath) {
  try {
    const files = await fs.promises.readdir(filePath);
    for (const file of files) {
      const fullPath = path.join(filePath, file);
      const stats = await fs.promises.stat(fullPath);

      if (stats.isFile() && file.endsWith(".md")) {
        markdownFiles.push(fullPath);
      } else if (stats.isDirectory()) {
        await getMarkdownFiles(fullPath);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function genImage(filePath, data) {
  const newChecksum = getFileChecksum(filePath);
  const checksumFileName = `${path.basename(
    filePath,
    path.extname(filePath)
  )}.md5`;
  const checksumHistoryPath = path.join(outputDir, checksumFileName);
  if (fs.existsSync(checksumHistoryPath)) {
    const oldChecksum = fs.readFileSync(checksumHistoryPath, "utf-8");

    if (newChecksum === oldChecksum && !forceRegenerate) {
      console.log("Skipping(same checksum found): ", filePath);
      return;
    }
  } else {
    fs.writeFileSync(checksumHistoryPath, newChecksum);
  }

  console.log("Generating image for: ", filePath);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // data.author = "Shawn Hsu";
  // data.avatar = "";

  page.setViewport({
    width: width + 16 * 2,
    height: Math.ceil(width / 1.91) + 16 * 2,
  });
  try {
    await page.setContent(generateHtml(data, { width }), {
      waitUntil: "domcontentloaded",
    });
  } catch (e) {
    console.error(`Cannot generate image for ${filePath}: ${e}`);
    await page.close();
    await browser.close();
    return;
  }

  await page.evaluate(async () => {
    const selectors = Array.from(document.querySelectorAll("img"));
    await Promise.all([
      document.fonts.ready,
      ...selectors.map((img) => {
        if (img.complete) {
          if (img.naturalHeight !== 0) return;
          throw new Error("Image failed to load");
        }
        return new Promise((resolve, reject) => {
          img.addEventListener("load", resolve);
          img.addEventListener("error", reject);
        });
      }),
    ]);
  });

  console.log("Writing to: ", `${outputDir}/${path.parse(filePath).name}.png`);
  await page.screenshot({
    fullPage: false,
    type: "png",
    path: `${outputDir}/${path.parse(filePath).name}.png`,
  });

  await page.close();
  await browser.close();
}

(async () => {
  await getMarkdownFiles(root);

  const parser = unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(extract, { yaml: parse });

  const markdownMap = new Map();
  for (const filePath of markdownFiles) {
    parser.process(fs.readFileSync(filePath), (err, file) => {
      markdownMap.set(filePath, file.data);
    });
  }

  for (const [filePath, data] of markdownMap) {
    await genImage(filePath, data);
  }
})();
