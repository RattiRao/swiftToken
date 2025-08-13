import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timestamp = process.env.TOKEN_TIMESTAMP

const tokenFilePath = path.join(__dirname, `figma-tokens/tokens_${timestamp}.json`);
const rawJson = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));

const globalFlatMap = flattenTokenTree(rawJson.variables?.global || {});

// --- Flattening Utility ---
function flattenTokenTree(obj, prefix = '', map = {}) {
  for (const key in obj) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && 'value' in val) {
      map[pathKey] = val.value;
    } else if (typeof val === 'object') {
      flattenTokenTree(val, pathKey, map);
    }
  }
  return map;
}

// --- Helpers ---
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sanitizeKey(k) {
  return k.replace(/[^\w]/g, '_').toLowerCase();
}

function formatValue(val, lang) {
  if (typeof val === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(val)) {
    return `Color(0xFF${val.replace('#', '').slice(0, -2).toUpperCase()})`;
  } 
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number') return lang === 'kotlin' ? `${val}f` : `${val}`;
  
  return `"${String(val)}"`; // fallback
}

// --- ThemeTokens Interface Builder ---
function buildThemeTokensInterface(fields) {
  const lines = Object.entries(fields).map(([name, type]) => `    val ${name}: ${type}`);
  return `
package com.pwc.sf49ers.core.common.ui.theme.tokens
      
import androidx.compose.ui.graphics.Color

interface ThemeTokens {
${lines.join('\n')}
}`.trim();
}

// --- Reference Resolvers ---
function resolveKotlinValue(value) {
  if (typeof value !== 'string') return formatValue(value, 'kotlin');
  if (!value.startsWith('{') || !value.endsWith('}')) return formatValue(value, 'kotlin');
  const ref = value.slice(1, -1);
  // Adjusted to get Global reference.
  if (ref.startsWith('global.')) return 'Global.' + sanitizeKey(ref.replace(/^global\./, ''));
  if (ref.startsWith('global.mode_1.')) return 'Global.' + sanitizeKey(ref.replace('global.mode_1.', ''));
  if (ref.startsWith('global.mode_2.')) return 'Global.' + sanitizeKey(ref.replace('global.mode_2.', ''));
  if (ref.startsWith('global.mode_3.')) return 'Global.' + sanitizeKey(ref.replace('global.mode_3.', ''));
  return `/* UNRESOLVED: ${value} */`;
}



// --- File Writers ---
function writeTokensToFile(fileName, tree, generator, resolveRefs = false, implementsInterface = false) {
  const lines = [generator.comment(fileName), '', ...(generator.lang === 'kotlin' ? [
      'package com.pwc.sf49ers.core.common.ui.theme.tokens',
      '',
      'import androidx.compose.ui.graphics.Color',
      '',
    ] : []), `${generator.container} ${fileName} ${implementsInterface ? " : ThemeTokens" : ""} {`];

  const walk = (obj, prefix = '') => {
    for (const key in obj) {
      const val = obj[key];
      const newKey = prefix ? `${prefix}_${key}` : key;

      // Update this section to assign type based on the 'type' attribute in the JSON
      if (val && typeof val === 'object' && 'value' in val) {
        const resolvedVal = resolveRefs ? generator.resolver(val.value) : formatValue(val.value, generator.lang);
        if (implementsInterface) {
          lines.push(`    override val ${sanitizeKey(newKey)} = ${resolvedVal}`);
        } else {
          lines.push(`${generator.decl(newKey, resolvedVal)}`);
        }

        // Collecting for ThemeTokens interface fields (exclude Global fields)
        if (!fileName.startsWith('Global')) {
          // Determine the type from the 'type' property defined in the JSON
          const type = val.type === 'color' ? `Color`
                      : val.type === 'dimension' ? 'Float'
                      : val.type === 'string' ? 'String'
                      : 'Any'; // or you can set a default type

          themeTokensFields[sanitizeKey(newKey)] = type;
        }
      } else if (typeof val === 'object') {
        walk(val, newKey);
      }
    }
  };
  
  walk(tree);
  lines.push('}');
  
  const outPath = path.join(__dirname, generator.outDir);
  fs.mkdirSync(outPath, { recursive: true });
  fs.writeFileSync(path.join(outPath, `${fileName}.${generator.fileExt}`), lines.join('\n'));
}

// --- Generator ---
const generator = {
  lang: 'kotlin',
  comment: name => `// Kotlin file for ${name}`,
  decl: (key, val) => `val ${sanitizeKey(key)} = ${val}`,
  container: 'object',
  fileExt: 'kt',
  outDir: 'figma-tokens/design_tokens/kotlin',
  resolver: resolveKotlinValue
};

// --- Main Loop ---
const themeTokensFields = {}; // Collect all fields for ThemeTokens interface
for (const [groupKey, groupValue] of Object.entries(rawJson)) {
  if (groupKey === 'variables') {
    if (groupValue.global) writeTokensToFile('Global', groupValue.global, generator, false);
    Object.entries(groupValue)
      .filter(([k]) => k !== 'global')
      .forEach(([themeKey, themeValue]) => {
        Object.entries(themeValue).forEach(([modeKey, modeValue]) => {
          const fileKey = capitalize(modeKey.replace(/-/g, '_'));
          // Write mode classes implementing ThemeTokens interface
          writeTokensToFile(fileKey, modeValue, generator, true, true);
        });
      });
  } else {
    const fileKey = capitalize(groupKey);
    writeTokensToFile(fileKey, groupValue, generator, false);
  }
}
console.log(`✅ Kotlin files generated in ${generator.outDir}`);

// Write the ThemeTokens interface after generating the model classes
const themeTokensInterface = buildThemeTokensInterface(themeTokensFields);
fs.writeFileSync(path.join(__dirname, 'figma-tokens/design_tokens/kotlin/ThemeTokens.kt'), themeTokensInterface);