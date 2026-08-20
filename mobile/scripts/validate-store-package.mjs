import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../store/', import.meta.url);
const required = [
  'metadata.md',
  'privacy-labels.md',
  'age-rating.md',
  'review-notes.md',
  'screenshots.md',
  'release-runbook.md',
];

const failures = [];
const files = new Map();
for (const name of required) {
  try {
    files.set(name, readFileSync(new URL(name, root), 'utf8'));
  } catch {
    failures.push(`missing mobile/store/${name}`);
  }
}

const metadata = files.get('metadata.md') ?? '';
function field(name) {
  const match = metadata.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  if (!match) {
    failures.push(`metadata is missing ${name}`);
    return '';
  }
  return match[1].trim();
}

const appName = field('App Name');
const subtitle = field('Subtitle');
const promotionalText = field('Promotional Text');
const keywords = field('Keywords');

if (appName.length < 2 || appName.length > 30) failures.push('App Name must be 2–30 characters');
if (subtitle.length > 30) failures.push('Subtitle must be at most 30 characters');
if (promotionalText.length > 170) failures.push('Promotional Text must be at most 170 characters');
if (Buffer.byteLength(keywords, 'utf8') > 100) failures.push('Keywords must be at most 100 UTF-8 bytes');
if (!/^https:\/\//.test(field('Support URL'))) failures.push('Support URL must use HTTPS');
if (!/^https:\/\//.test(field('Privacy URL'))) failures.push('Privacy URL must use HTTPS');

for (const [name, content] of files) {
  if (!/^#\s+/m.test(content)) failures.push(`${name} needs a title`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`App Store package valid (${join('mobile', 'store')}; ${required.length} files)`);
