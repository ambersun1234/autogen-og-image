import fs from "fs";
import path from "path";
import crypto from "crypto";

import _ from "lodash";
import * as core from "@actions/core";
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
  if (!process.env.INPUT_DIR && !core.getInput("input_dir")) {
    throw new Error("Missing required environment variables: INPUT_DIR");
  }

  if (!process.env.OUTPUT_DIR && !core.getInput("output_dir")) {
    throw new Error("Missing required environment variables: OUTPUT_DIR");
  }

  const sys = {
    inputDir: process.env.INPUT_DIR || core.getInput("input_dir"),
    outputDir: process.env.OUTPUT_DIR || core.getInput("output_dir"),
    forceRegenerate:
      (process.env.FORCE_REGENERATE || core.getInput("force_regenerate")) ===
      "true"
        ? true
        : false,
  };

  const data = {
    author: process.env.AUTHOR || core.getInput("author") || "",
    avatar: process.env.AVATAR || core.getInput("avatar") || null,
  };

  const rawOptions = {
    width: 1200,
    height: 630,
    headerColor:
      process.env.HEADER_COLOR || core.getInput("header_color") || "#0366d6",
    headerSize: process.env.HEADER_SIZE || core.getInput("header_size") || 56,
    descriptionColor:
      process.env.DESCRIPTION_COLOR ||
      core.getInput("description_color") ||
      "#586069",
    descriptionSize:
      process.env.DESCRIPTION_SIZE || core.getInput("description_size") || 32,
    footerColor:
      process.env.FOOTER_COLOR || core.getInput("footer_color") || "#586069",
    footerSize: process.env.FOOTER_SIZE || core.getInput("footer_size") || 16,
  };
  const options = _.transform(rawOptions, function (result, value, key) {
    let numberValue = Number(value);
    result[key] = isNaN(numberValue) ? value : numberValue;
  });

  return { data, options, sys };
}

function getJekyllData(data) {
  const requiredFields = ["title", "description", "date"];
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
    date: data.date,
  };
}

function getFileChecksum(filePath) {
  const f = fs.readFileSync(filePath, "utf-8");
  return crypto.createHash("md5").update(f).digest("hex");
}

function getFileSlug(filePath) {
  const filename = path.basename(filePath, path.extname(filePath));
  const slugIndex = filename.search(/[a-zA-Z]/);
  return filename.substring(slugIndex);
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
  const slug = getFileSlug(filePath);

  await fs.promises.mkdir(customizedEnv.sys.outputDir, { recursive: true });
  await fs.promises.writeFile(path.join(customizedEnv.sys.outputDir, ".nojekyll"), "")

  const newChecksum = getFileChecksum(filePath);
  const checksumFileName = `${slug}.md5`;
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
  }

  console.log("Generating image for: ", filePath);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--enable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: "/usr/bin/google-chrome-stable",
  });
  const page = await browser.newPage();

  data.author = customizedEnv.data.author;
  data.avatar = customizedEnv.data.avatar;

  const padding = 32;
  page.setViewport({
    width: customizedEnv.options.width + padding * 2,
    height: customizedEnv.options.height + padding * 2,
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

  // write checksum to file after all the generation
  fs.writeFileSync(checksumHistoryPath, newChecksum);

  console.log("Writing to: ", `${customizedEnv.sys.outputDir}/${slug}.png`);
  await page.screenshot({
    fullPage: false,
    type: "png",
    path: `${customizedEnv.sys.outputDir}/${slug}.png`,
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

  for (const [filePath, data] of markdownMap) {
    await genImage(filePath, data);
  }
})();
