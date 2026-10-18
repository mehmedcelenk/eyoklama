#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
const HTML_FILE = path.resolve(process.cwd(), 'index.html');
const MAX_LINES = 350;

let hasErrors = false;

function error(msg) {
  console.error(`❌ Architecture Violation: ${msg}`);
  hasErrors = true;
}

function success(msg) {
  console.log(`✅ ${msg}`);
}

// 1. Line Count Check (<= 350 lines)
function getAllFiles(dir, extensions = ['.ts', '.js', '.css']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, extensions));
    } else {
      if (extensions.some((ext) => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

console.log('🔍 Checking line count limits (max 350 lines)...');
if (fs.existsSync(SRC_DIR)) {
  const srcFiles = getAllFiles(SRC_DIR);
  let checkedCount = 0;
  let lineViolations = 0;
  for (const file of srcFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    const rel = path.relative(process.cwd(), file);
    if (lines > MAX_LINES) {
      error(`File ${rel} exceeds ${MAX_LINES} lines (actual: ${lines})`);
      lineViolations++;
    } else {
      checkedCount++;
    }
  }
  if (lineViolations === 0) {
    success(`Checked ${checkedCount} file(s) for line count constraints (all <= ${MAX_LINES} lines)`);
  }
}

// 2. Inline Event Handlers Check in index.html
console.log('🔍 Checking index.html for inline event handlers...');
if (fs.existsSync(HTML_FILE)) {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const inlineHandlerRegex = /\bon[a-zA-Z]+\s*=/g;
  const matches = html.match(inlineHandlerRegex);
  if (matches && matches.length > 0) {
    error(`index.html contains ${matches.length} inline event handler(s): ${matches.join(', ')}`);
  } else {
    success('index.html contains 0 inline event handlers');
  }
}

// 3. Layer Isolation Rules & Import Restrictions
console.log('🔍 Checking 4-tier layer isolation rules...');
const layerRanks = {
  shared: 0,
  data: 1,
  features: 2,
  app: 3
};

function getLayer(filePath) {
  const rel = path.relative(SRC_DIR, filePath);
  const parts = rel.split(path.sep);
  return parts[0]; // 'shared', 'data', 'features', 'app', or 'styles'
}

if (fs.existsSync(SRC_DIR)) {
  const tsFiles = getAllFiles(SRC_DIR, ['.ts']);
  let layerViolations = 0;

  for (const file of tsFiles) {
    const fromLayer = getLayer(file);
    if (!Object.prototype.hasOwnProperty.call(layerRanks, fromLayer)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /(?:(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|import\s*\(\s*)['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      let toLayer = null;
      if (importPath.startsWith('@')) {
        toLayer = importPath.slice(1).split('/')[0];
      } else if (importPath.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), importPath);
        if (resolved.startsWith(SRC_DIR)) {
          toLayer = getLayer(resolved);
        }
      }

      if (toLayer && Object.prototype.hasOwnProperty.call(layerRanks, toLayer)) {
        if (layerRanks[toLayer] > layerRanks[fromLayer]) {
          const rel = path.relative(process.cwd(), file);
          error(`Illegal upward import in ${rel} (layer '${fromLayer}') importing from '${toLayer}': ${importPath}`);
          layerViolations++;
        }
      }
    }
  }
  if (layerViolations === 0) {
    success('4-tier layer isolation rules verified (unidirectional downward flow)');
  }
}

// 4. Circular Dependency Detection
console.log('🔍 Checking for circular dependencies...');
if (fs.existsSync(SRC_DIR)) {
  const tsFiles = getAllFiles(SRC_DIR, ['.ts']);
  const adj = new Map();
  for (const f of tsFiles) adj.set(f, []);

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /(?:(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|import\s*\(\s*)['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      let resolvedPath = null;
      const importTarget = match[1];
      if (importTarget.startsWith('@')) {
        const sub = importTarget.replace(/^@/, '');
        resolvedPath = path.resolve(SRC_DIR, sub);
      } else if (importTarget.startsWith('.')) {
        resolvedPath = path.resolve(path.dirname(file), importTarget);
      }
      if (resolvedPath) {
        for (const ext of ['', '.ts', '/index.ts']) {
          const cand = resolvedPath + ext;
          if (fs.existsSync(cand) && !fs.statSync(cand).isDirectory()) {
            adj.get(file)?.push(cand);
            break;
          }
        }
      }
    }
  }

  const visited = new Set();
  const recStack = new Set();
  let cycleViolations = 0;

  function detectCycle(node, pathStack = []) {
    visited.add(node);
    recStack.add(node);
    pathStack.push(node);

    for (const neighbor of (adj.get(node) || [])) {
      if (!visited.has(neighbor)) {
        if (detectCycle(neighbor, pathStack)) return true;
      } else if (recStack.has(neighbor)) {
        const cycle = pathStack.slice(pathStack.indexOf(neighbor)).concat(neighbor)
          .map((p) => path.relative(process.cwd(), p)).join(' -> ');
        error(`Circular dependency detected: ${cycle}`);
        cycleViolations++;
        return true;
      }
    }

    recStack.delete(node);
    pathStack.pop();
    return false;
  }

  for (const node of tsFiles) {
    if (!visited.has(node)) {
      detectCycle(node);
    }
  }
  if (cycleViolations === 0) {
    success('Circular dependency check passed (0 cycles detected)');
  }
}

if (hasErrors) {
  console.error('\n❌ Architecture check failed.');
  process.exit(1);
} else {
  success('All architecture rules satisfied.');
  process.exit(0);
}
