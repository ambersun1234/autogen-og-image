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
import dotenv from "dotenv";

import { generateHtml } from "./gen-html.js";

dotenv.config();

const customizedEnv = getEnv();
const markdownFiles = [];

function getEnv() {
  if (!process.env.INPUT_DIR || !process.env.OUTPUT_DIR) {
    throw new Error(
      "Missing required environment variables: INPUT_DIR, OUTPUT_DIR"
    );
  }

  const sys = {
    inputDir: process.env.INPUT_DIR,
    outputDir: process.env.OUTPUT_DIR,
    forceRegenerate: process.env.FORCE_REGENERATE === "true" ? true : false,
  };

  const data = {
    inputDir: process.env.INPUT_DIR,
    outputDir: process.env.OUTPUT_DIR,
    author: process.env.AUTHOR || "",
    avatar: process.env.AVATAR || null,
  };

  const options = {
    width: process.env.WIDTH || 630,
    headerColor: process.env.HEADER_COLOR || "#0366d6",
    headerSize: process.env.HEADER_SIZE || 32,
    descriptionColor: process.env.DESCRIPTION_COLOR || "#586069",
    descriptionSize: process.env.DESCRIPTION_SIZE || 16,
    footerColor: process.env.FOOTER_COLOR || "#586069",
    footerSize: process.env.FOOTER_SIZE || 12,
  };

  return { data, options, sys };
}

function getJekyllData(data) {
  // const requiredFields = ["title", "description", "author", "date"];
  const requiredFields = ["title", "author", "date"];
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return {
    title: data.title,
    description: data.description,
    author: data.author,
    avatar: data.avatar || null,
    date: new Date(),
  };
}

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

    if (newChecksum === oldChecksum && !customizedEnv.sys.forceRegenerate) {
      console.log("Skipping(same checksum found): ", filePath);
      return;
    }
  } else {
    fs.writeFileSync(checksumHistoryPath, newChecksum);
  }

  console.log("Generating image for: ", filePath);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  data.author = customizedEnv.data.author;
  data.avatar = customizedEnv.data.avatar;

  const width = customizedEnv.options.width;
  page.setViewport({
    width: width + 16 * 2,
    height: Math.ceil(width / 1.91) + 16 * 2,
  });
  try {
    await page.setContent(
      generateHtml(getJekyllData(data), customizedEnv.options),
      {
        waitUntil: "domcontentloaded",
      }
    );
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
  await getMarkdownFiles(inputDir);

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