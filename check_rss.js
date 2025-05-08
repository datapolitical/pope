#!/usr/bin/env node
// check_rss.js

import axios from 'axios';
import fs from 'fs';
import * as core from '@actions/core';
import { XMLParser } from 'fast-xml-parser';

//
// ---------- Config ----------
//
const RSS_URL     = 'https://www.vaticannews.va/en.rss.xml';
const MEMORY_FILE = 'last_guid.txt';
const TEST_MODE   = process.env.TEST_MODE === 'true';

//
// ---------- Classification rules ----------
//
const EXPLANATORY_PATTERNS = [
  /\bhistory\b/i, /\bbehind\b/i, /\bexplained?\b/i,
  /\bguide\b/i,   /\bwhat is\b/i
];

const ANNOUNCEMENT_PHRASES = [
  'habemus papam','new pope elected','cardinal elected pope',
  'pope francis elected','we have a pope','vatican announces new pope',
  'pope has been elected','new pontiff','bishop of rome elected',
  'cardinals elect new pope','new bishop of rome','new pope chosen',
  'pontiff chosen','pope selected'
];

const ELECTION_CONTEXT_TERMS = [
  'pope','conclave','elect','elected','papal','new pope','pontiff'
];

const GENERIC_PHRASES = [
  'white smoke','papal conclave','conclave','sistine chapel',
  'vatican city','cardinals vote','voting underway','smoke rises',
  'papal election','vatican crowd','pope watchers'
];

const IRRELEVANT_PHRASES = [
  'wildfire','rumor','fake','hoax'
];

function classifyArticle(title, content) {
  const txt = (title + ' ' + content).toLowerCase();

  // 0) Explanatory/history override
  if (EXPLANATORY_PATTERNS.some(rx => rx.test(txt))) return 'generic';

  // 1) Black‑smoke override
  if (/\bblack smoke\b/.test(txt)) return 'irrelevant';

  // 2) Exact announcements
  for (const p of ANNOUNCEMENT_PHRASES) if (txt.includes(p)) return 'announcement';

  // 3) White smoke + context → announcement
  if (/\bwhite smoke\b/.test(txt) &&
      ELECTION_CONTEXT_TERMS.some(t => txt.includes(t))
  ) return 'announcement';

  // 4) Fallback scoring
  let score = 0;
  for (const p of ANNOUNCEMENT_PHRASES) score += txt.includes(p) ? 3 : 0;
  for (const p of GENERIC_PHRASES)      score += txt.includes(p) ? 1 : 0;
  for (const p of IRRELEVANT_PHRASES)   score -= txt.includes(p) ? 3 : 0;
  if (score >= 5) return 'announcement';
  if (score >= 1) return 'generic';
  return 'irrelevant';
}

async function sendPushNotification(title, link, isTest = false) {
  const user  = process.env.PUSHOVER_USER_KEY;
  const token = process.env.PUSHOVER_APP_TOKEN;
  if (!user || !token) {
    console.error('🔑 Pushover credentials not set.');
    return;
  }
  const payload = {
    token, user,
    title:   isTest ? '*** TEST POPE ALERT ***' : '*** NEW POPE ELECTED ***',
    message: `${title}\n${link}`,
    priority: 2, retry: 60, expire: 3600
  };
  try {
    await axios.post('https://api.pushover.net/1/messages.json', payload);
    console.log('► Pushover notification sent.');
  } catch (err) {
    console.error('❌ Pushover error:', err.response?.data || err.message);
    core.setFailed('Notification failed.');
  }
}

function getLastSeenGuid() {
  try { return fs.readFileSync(MEMORY_FILE, 'utf8').trim(); }
  catch { return null; }
}
function setLastSeenGuid(guid) {
  try { fs.writeFileSync(MEMORY_FILE, guid.trim(), 'utf8'); }
  catch (e) { console.error('✍️ Write error:', e.message); }
}

async function main() {
  try {
    let item;

    if (TEST_MODE) {
      console.log('⚙️ TEST_MODE');
      item = {
        guid: 'test-guid',
        title: 'Habemus Papam: Cardinal Doe elected Pope Innocent XIV',
        description: 'Cardinals have elected a new pope during the fifth ballot.',
        link: 'https://example.com/fake-pope'
      };
    } else {
      // Fetch & dump
      const { data: xml, status, headers } = await axios.get(RSS_URL);
      console.log(`Fetched ${RSS_URL} → HTTP ${status}`);
      console.log(`Content-Type: ${headers['content-type']}`);
      fs.writeFileSync('rss_dump.xml', xml);

      // Parse
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        isArray: tagName => tagName === 'item'
      });
      const json = parser.parse(xml);

      // Dive in
      const channel = json.rss?.channel;
      if (!channel) {
        core.setFailed('❌ RSS <channel> not found.');
        return;
      }
      const items = Array.isArray(channel) ? channel[0].item : channel.item;
      if (!items?.length) {
        core.setFailed('❌ No <item> found.');
        return;
      }

      item = items[0];
    }

    const { guid, title, description = '', link } = item;
    if (!guid) {
      core.setFailed('❌ Missing GUID');
      return;
    }

    // Dedupe
    const last = getLastSeenGuid();
    if (!TEST_MODE && guid === last) {
      console.log(`↩️ Skipping duplicate: ${title}`);
      return;
    }

    // Classify & notify
    const cls = classifyArticle(title, description);
    if (cls === 'announcement') {
      console.log(`🎉 ANNOUNCEMENT 🎉\n${title}\n${link}`);
      await sendPushNotification(title, link, TEST_MODE);
    } else {
      console.log(`[${cls.toUpperCase()}] ${title}`);
    }

    // Persist
    if (!TEST_MODE) setLastSeenGuid(guid);

  } catch (e) {
    core.setFailed(`Script error: ${e.message}`);
    fs.writeFileSync('rss_error.txt', e.stack || e.toString());
  }
}

main();