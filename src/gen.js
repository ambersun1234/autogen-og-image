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
import camelcaseKeys from "camelcase-keys";

dotenv.config();

const customizedEnv = getEnv();
const markdownFiles = [];

function formatDate(dateString) {
  const options = { year: "numeric", month: "short", day: "numeric" };
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", options);
}

function getEnv() {
  if (!process.env.INPUT_DIR || !process.env.OUTPUT_DIR) {
    throw new Error(
      "Missing required environment variables: INPUT_DIR, OUTPUT_DIR"
    );
  }

  const sys = {
    inputDir: process.env.INPUT_DIR,
    outputDir: process.env.OUTPUT_DIR,
    templatePath: process.env.TEMPLATE_PATH || "./template.html",
    forceRegenerate: process.env.FORCE_REGENERATE === "true" ? true : false,
  };

  const rawData = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("DATA_")) {
      rawData[key.replace("DATA_", "")] = process.env[key];
    }
  }
  const data = camelcaseKeys(rawData, { deep: true });

  return { data, sys };
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
    date: formatDate(data.date),
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

async function genImage(filePath, template, rawData) {
  const newChecksum = getFileChecksum(filePath);
  const checksumFileName = `${path.basename(
    filePath,
    path.extname(filePath)
  )}.md5`;
  const checksumHistoryPath = path.join(
    customizedEnv.sys.outputDir,
    checksumFileName
  );
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

  rawData.author = customizedEnv.data.author;
  rawData.avatar = customizedEnv.data.avatar;

  const width = 630;
  page.setViewport({
    width: width + 16 * 2,
    height: Math.ceil(width / 1.91) + 16 * 2,
  });
  try {
    const data = getJekyllData(rawData);
    const templateInjection = new Function("data", "return `" + template + "`");

    await page.setContent(templateInjection(data), {
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

  console.log(
    "Writing to: ",
    `${customizedEnv.sys.outputDir}/${path.parse(filePath).name}.png`
  );
  await page.screenshot({
    fullPage: false,
    type: "png",
    path: `${customizedEnv.sys.outputDir}/${path.parse(filePath).name}.png`,
  });

  await page.close();
  await browser.close();
}

(async () => {
  await getMarkdownFiles(customizedEnv.sys.inputDir);

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

  const template = fs.readFileSync(customizedEnv.sys.templatePath, "utf-8");
  for (const [filePath, data] of markdownMap) {
    await genImage(filePath, template, data);
  }
})();
