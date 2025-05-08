#!/usr/bin/env node
// check_rss.js

import axios from 'axios';
import fs from 'fs';
import * as core from '@actions/core';
import xml2js from 'xml2js';

//
// ---------- Configuration ----------
//
const RSS_URL     = 'https://www.vaticannews.va/en.rss.xml';
const MEMORY_FILE = 'last_guid.txt';
const TEST_MODE   = process.env.TEST_MODE === 'true';

//
// ---------- Classification rules ----------
//

// 0) Explanatory/history override → always generic
const EXPLANATORY_PATTERNS = [
  /\bhistory\b/i,
  /\bbehind\b/i,
  /\bexplained?\b/i,
  /\bguide\b/i,
  /\bwhat is\b/i
];

// 1) Exact, unambiguous announcement phrases
const ANNOUNCEMENT_PHRASES = [
  'habemus papam',
  'new pope elected',
  'cardinal elected pope',
  'pope francis elected',
  'we have a pope',
  'vatican announces new pope',
  'pope has been elected',
  'new pontiff',
  'bishop of rome elected',
  'cardinals elect new pope',
  'new bishop of rome',
  'new pope chosen',
  'pontiff chosen',
  'pope selected'
];

// 2) Terms that signal the election context
const ELECTION_CONTEXT_TERMS = [
  'pope',
  'conclave',
  'elect',
  'elected',
  'papal',
  'new pope',
  'pontiff'
];

// 3) General signal words (including white smoke)
const GENERIC_PHRASES = [
  'white smoke',
  'papal conclave',
  'conclave',
  'sistine chapel',
  'vatican city',
  'cardinals vote',
  'voting underway',
  'smoke rises',
  'papal election',
  'vatican crowd',
  'pope watchers'
];

// 4) Noise terms to heavily penalize
const IRRELEVANT_PHRASES = [
  'wildfire',
  'rumor',
  'fake',
  'hoax'
];

/**
 * Classify into 'announcement', 'generic', or 'irrelevant'
 */
function classifyArticle(title, content) {
  const text = (title + ' ' + content).toLowerCase();

  // Explanatory override
  if (EXPLANATORY_PATTERNS.some(rx => rx.test(text))) {
    return 'generic';
  }

  // Black smoke override
  if (/\bblack smoke\b/.test(text)) {
    return 'irrelevant';
  }

  // Exact announcement
  for (const phrase of ANNOUNCEMENT_PHRASES) {
    if (text.includes(phrase)) {
      return 'announcement';
    }
  }

  // White smoke + election context => announcement
  if (/\bwhite smoke\b/.test(text) &&
      ELECTION_CONTEXT_TERMS.some(term => text.includes(term))
  ) {
    return 'announcement';
  }

  // Fallback scoring
  let score = 0;
  for (const p of ANNOUNCEMENT_PHRASES)  if (text.includes(p)) score += 3;
  for (const p of GENERIC_PHRASES)       if (text.includes(p)) score += 1;
  for (const p of IRRELEVANT_PHRASES)    if (text.includes(p)) score -= 3;

  if (score >= 5)   return 'announcement';
  if (score >= 1)   return 'generic';
  return 'irrelevant';
}

//
// ---------- Pushover notification ----------
//
async function sendPushNotification(title, link, isTest = false) {
  const user  = process.env.PUSHOVER_USER_KEY;
  const token = process.env.PUSHOVER_APP_TOKEN;
  if (!user || !token) {
    console.error('Pushover credentials not set.');
    return;
  }

  const payload = {
    token,
    user,
    title:   isTest ? '*** TEST POPE ALERT ***' : '*** NEW POPE ELECTED ***',
    message: `${title}\n${link}`,
    priority: 2,
    retry:    60,
    expire:   3600
  };

  try {
    await axios.post('https://api.pushover.net/1/messages.json', payload);
    console.log('► Pushover notification sent.');
  } catch (err) {
    console.error('❌ Pushover error:', err.response?.data || err.message);
    core.setFailed('Pushover notification failed.');
  }
}

//
// ---------- Deduplication ----------
//
function getLastSeenGuid() {
  try {
    return fs.readFileSync(MEMORY_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

function setLastSeenGuid(guid) {
  try {
    fs.writeFileSync(MEMORY_FILE, guid.trim(), 'utf8');
  } catch (err) {
    console.error('Failed to write memory file:', err.message);
  }
}

//
// ---------- Main logic ----------
//
async function main() {
  try {
    let article;

    if (TEST_MODE) {
      console.log('⚙️  Running in TEST MODE');
      article = {
        guid:        'test-guid',
        title:       'Habemus Papam: Cardinal Doe elected Pope Innocent XIV',
        description: 'Cardinals have elected a new pope during the fifth ballot.',
        link:        'https://example.com/fake-pope-news',
        pubDate:     new Date().toISOString()
      };
    } else {
      // 1) Fetch RSS XML
      const { data: xml } = await axios.get(RSS_URL);
      fs.writeFileSync('rss_dump.xml', xml);

      // 2) Parse XML
      const parser = new xml2js.Parser({ strict: false, trim: true });
      const result = await parser.parseStringPromise(xml);
      const items = result.rss.channel[0].item || [];

      if (items.length === 0) {
        core.setFailed('No items found in RSS feed.');
        return;
      }

      // 3) Take latest
      const first = items[0];
      article = {
        guid:        first.guid?.[0]._ || first.guid?.[0] || first.link?.[0] || '',
        title:       first.title?.[0]    || '',
        description: first.description?.[0] || '',
        link:        first.link?.[0]     || '',
        pubDate:     first.pubDate?.[0]  || ''
      };
    }

    const { guid, title, description, link } = article;
    if (!guid) {
      core.setFailed('No GUID on latest article.');
      return;
    }

    // 4) Deduplicate
    const lastSeen = getLastSeenGuid();
    if (!TEST_MODE && guid === lastSeen) {
      console.log(`↩️  Skipping duplicate: ${title}`);
      return;
    }

    // 5) Classify & notify
    const cls = classifyArticle(title, description);
    if (cls === 'announcement') {
      console.log(`🎉 NEW POPE ELECTED 🎉\n${title}\n${link}`);
      await sendPushNotification(title, link, TEST_MODE);
    } else {
      console.log(`[${cls.toUpperCase()}] ${title}`);
    }

    // 6) Persist GUID for next run
    if (!TEST_MODE) {
      setLastSeenGuid(guid);
    }

  } catch (err) {
    core.setFailed(`Script error: ${err.message}`);
    fs.writeFileSync('rss_error.txt', err.stack || err.toString());
  }
}

main();