// generate-swift-tokens.js
// A standalone script to generate SwiftUI token files from Figma JSON tokens

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load JSON tokens based on environment timestamp ---
const timestamp = process.env.TOKEN_TIMESTAMP;
if (!timestamp) {
  console.error('Error: TOKEN_TIMESTAMP environment variable is required');
  process.exit(1);
}
const tokenFilePath = path.join(__dirname, `figma-tokens/tokens_${timestamp}.json`);
const rawJson = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));

// --- Helpers ---
function sanitizeKey(k) {
  let s = k.replace(/[^\w]/g, '_').toLowerCase();
  if (/^\d/.test(s)) s = '_' + s;
  return s;
}

function formatColor(val) {
  const hex = val.replace('#', '').length === 6 ? `FF${val.replace('#', '')}` : val.replace('#', '');
  return `Color(argb: 0x${hex.toUpperCase()})`;
}

// --- Swift Value Resolver ---
function resolveSwiftValue(raw, key) {
  // Number -> CGFloat
  if (typeof raw === 'number') {
    return { value: `${raw}`, type: 'CGFloat' };
  }
  // Hex color string
  if (typeof raw === 'string' && /^#[0-9A-Fa-f]{6,8}$/.test(raw)) {
    return { value: formatColor(raw), type: 'Color' };
  }
  // Font weight tokens
  if (/typography[_\.]font[_\.]weight/.test(key) && typeof raw === 'string') {
    const w = raw.replace(/"/g, '');
    return { value: `.${w}`, type: 'Font.Weight' };
  }
  // Font family names like dm_sans -> "DM Sans"
  if (typeof raw === 'string' && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)) {
    const display = raw
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { value: `"${display}"`, type: 'String' };
  }
  // References
  if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
    const ref = raw.slice(1, -1);
    if (ref.startsWith('global.')) {
      const refKey = sanitizeKey(ref.replace(/^global\./, ''));
      return { value: `GlobalTokens.${refKey}`, type: null };
    }
  }
  // Fallback to string
  return { value: `"${String(raw)}"`, type: null };
}

// --- File Writers ---
function writeTokensToFile(fileName, tree, outDir) {
  const lines = [
    `// Swift file for ${fileName}`,
    '',
    'import SwiftUI',
    `struct ${fileName} {`
  ];

  function walk(obj, prefix = '') {
    for (const key in obj) {
      const node = obj[key];
      const name = prefix ? `${prefix}_${key}` : key;
      if (node && typeof node === 'object' && 'value' in node) {
        const raw = node.value;
        const { value, type } = resolveSwiftValue(raw, name);
        const annotation = type ? `: ${type}` : '';
        lines.push(`    static let ${sanitizeKey(name)}${annotation} = ${value}`);
      } else if (typeof node === 'object') {
        walk(node, name);
      }
    }
  }
  walk(tree);
  lines.push('}');

  const dir = path.join(__dirname, outDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fileName}.swift`), lines.join('\n'));
}

// --- Main Execution ---
const { variables } = rawJson;

// Global Tokens
if (variables.global) {
  writeTokensToFile('GlobalTokens', variables.global, 'figma-tokens/design_tokens/swift');
}

// Theme Modes
Object.entries(variables)
  .filter(([key]) => key !== 'global')
  .forEach(([themeKey, themeValue]) => {
    Object.entries(themeValue).forEach(([modeKey, modeTree]) => {
      const structName = modeKey
        .split('-')
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
      writeTokensToFile(structName, modeTree, 'figma-tokens/design_tokens/swift');
    });
  });

console.log('✅ SwiftUI token files generated');
