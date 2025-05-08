#!/usr/bin/env node
// check_rss.js

import axios from 'axios';
import fs from 'fs';
import * as core from '@actions/core';
import xml2js from 'xml2js';

const RSS_URL     = 'https://www.vaticannews.va/en.rss.xml';
const MEMORY_FILE = 'last_guid.txt';
const TEST_MODE   = process.env.TEST_MODE === 'true';

// …[classification rules omitted for brevity, they stay exactly the same]…

async function main() {
  try {
    let article;

    if (TEST_MODE) {
      // …[test mode stub]…
    } else {
      // 1) Fetch the RSS feed
      const response = await axios.get(RSS_URL);
      console.log(`Fetched ${RSS_URL} → HTTP ${response.status}`);
      console.log(`Content‑Type: ${response.headers['content-type']}`);
      const xml = response.data;
      fs.writeFileSync('rss_dump.xml', xml);

      // 2) Dump a snippet so we can inspect
      console.log('--- RSS Snippet (first 200 chars) ---');
      console.log(xml.slice(0, 200).replace(/\n/g, ' '));
      console.log('-------------------------------------');

      // 3) Quick sanity check
      if (!xml.includes('<rss') && !xml.includes('<channel')) {
        core.setFailed('Fetched content does not look like RSS XML.');
        return;
      }

      // 4) Parse XML
      const parser = new xml2js.Parser({ strict: false, trim: true });
      const result = await parser.parseStringPromise(xml);

      // 5) Robustly locate <channel>
      const rootKey = Object.keys(result)[0];
      const rssRoot = result[rootKey];
      const channelArr = rssRoot.channel || rssRoot['rss:channel'];
      if (!Array.isArray(channelArr) || !channelArr[0]) {
        core.setFailed('Malformed RSS: <channel> not found.');
        return;
      }
      const channel = channelArr[0];

      // 6) Extract items
      const items = channel.item || [];
      if (items.length === 0) {
        core.setFailed('No items found in RSS feed.');
        return;
      }

      const first = items[0];
      article = {
        guid:        first.guid?.[0]?._ || first.guid?.[0] || first.link?.[0] || '',
        title:       first.title?.[0]    || '',
        description: first.description?.[0] || '',
        link:        first.link?.[0]     || '',
        pubDate:     first.pubDate?.[0]  || ''
      };
    }

    // …[rest of your dedupe + classify + notify code remains unchanged]…
  } catch (err) {
    core.setFailed(`Script error: ${err.message}`);
    fs.writeFileSync('rss_error.txt', err.stack || err.toString());
  }
}

main();