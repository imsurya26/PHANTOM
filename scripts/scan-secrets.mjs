import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRIVATE_NAMES = [
  'FIRMS_MAP_KEY', 'OPENAQ_API_KEY', 'AISSTREAM_API_KEY', 'MAPILLARY_CLIENT_SECRET',
  'GEMINI_API_KEY', 'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'TOMTOM_API_KEY',
  'GOOGLE_MAPS_SERVER_API_KEY', 'GOOGLE_STREETVIEW_SERVER_API_KEY', 'LL2_API_TOKEN', 'OPENAI_API_KEY', 'PHANTOM_REDIS_REST_TOKEN',
];
const entropy = value => {
  const counts = new Map();
  for (const c of value) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.values()].reduce((n, c) => n - c / value.length * Math.log2(c / value.length), 0);
};

/** Report rule names only. No value, snippet, hash, prefix or provider response. */
export function detectSecrets(text, knownSecrets = [], allowedPublicValues = []) {
  const hits = new Set();
  for (const secret of knownSecrets) {
    if (!secret) continue;
    const forms = [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), Buffer.from(secret).toString('base64')];
    if (forms.some(form => text.includes(form))) hits.add('configured-private-value');
  }
  // Only generated assets may carry the exact configured public browser tokens.
  // The private-value check above still wins if a key was misclassified twice.
  for (const value of allowedPublicValues) {
    if (typeof value === 'string' && value.length >= 8)
      text = text.split(value).join('[PUBLIC BROWSER TOKEN]');
  }
  const formats = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
    ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
    ['openai-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
    ['mapillary-token', /\bMLY\|\d{8,}\|[A-Za-z0-9_-]{24,}/g],
    ['aws-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ];
  for (const [name, rule] of formats) {
    for (const match of text.matchAll(rule)) {
      if (name === 'private-key' || entropy(match[0]) > 3.4) hits.add(name);
    }
  }
  const names = PRIVATE_NAMES.join('|');
  const assignment = new RegExp(`(?:${names})["']?[ \\t]*([:=])[ \\t]*(["']?)([A-Za-z0-9_./+|@=-]{20,})`, 'g');
  for (const match of text.matchAll(assignment)) {
    // A JavaScript object property holding another variable is not a literal.
    if (match[1] === ':' && !match[2]) continue;
    if (entropy(match[3]) > 3.5 && !/process\.env|import\.meta|configured|placeholder|example|fixture/i.test(match[3])) hits.add('private-credential-assignment');
  }
  const generic = /\b(?:apiKey|api_key|clientSecret|client_secret|password)["']?[ \t]*[:=][ \t]*["']([A-Za-z0-9_./+|@=-]{24,})["']/gi;
  for (const match of text.matchAll(generic)) {
    if (entropy(match[1]) > 4 && !/placeholder|example|fixture/i.test(match[1])) hits.add('credential-assignment');
  }
  return [...hits];
}

function configuredSecrets(root) {
  const publicNames = ['GOOGLE_MAPS_API_KEY', 'MAPILLARY_CLIENT_TOKEN', 'CESIUM_ION_TOKEN'];
  const values = PRIVATE_NAMES.map(name => process.env[name]).filter(Boolean);
  const publicValues = publicNames.map(name => process.env[name]).filter(Boolean);
  // Read ignored environment files only to compare against outputs, never scan
  // or report their content. No evaluation, expansion, logging or network use.
  for (const name of readdirSync(root).filter(name => /^\.env(?:\..+)?$/.test(name) && name !== '.env.example')) {
    if (!statSync(join(root, name)).isFile()) continue;
    const content = readFileSync(join(root, name), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || ![...PRIVATE_NAMES, ...publicNames].includes(match[1])) continue;
      let value = match[2];
      if (/^["']/.test(value)) value = value.slice(1, value.lastIndexOf(value[0]));
      else value = value.replace(/\s+#.*$/, '');
      if (value) (PRIVATE_NAMES.includes(match[1]) ? values : publicValues).push(value);
    }
  }
  return { privateValues: [...new Set(values)], publicValues: [...new Set(publicValues)] };
}

function artifactFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...artifactFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

export async function scanRepository(root, { history = true, artifacts = false } = {}) {
  const known = configuredSecrets(root);
  const findings = new Map();
  const inspect = (content, location, artifact = false) => {
    const hits = detectSecrets(content, known.privateValues, artifact ? known.publicValues : []);
    if (hits.length) findings.set(location, [...new Set([...(findings.get(location) || []), ...hits])]);
  };
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const files = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))];
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    inspect(readFileSync(path).toString('utf8'), file);
  }
  if (artifacts && !existsSync(join(root, 'dist'))) throw new Error('Build artifacts are required before artifact scanning');
  const built = artifacts ? artifactFiles(join(root, 'dist')) : [];
  for (const file of built) inspect(readFileSync(file).toString('utf8'), relative(root, file), true);
  if (history) {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') throw new Error('Full Git history is required for history scanning');
    // Stream all reachable patch contents, including binary files as text.
    // Overlap spans split writes; no complete Git patch is retained or printed.
    await new Promise((success, reject) => {
      const child = spawn('git', ['log', '--all', '--format=fuller', '--patch', '--text', '--no-ext-diff', '--no-textconv', '--no-renames'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '';
      let commit = 'unknown';
      let file = 'metadata';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        const text = tail + chunk;
        if (detectSecrets(text, known.privateValues).length) {
          for (const line of text.split('\n')) {
            const revision = line.match(/^commit ([a-f0-9]{40})$/);
            const path = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
            if (revision) { commit = revision[1]; file = 'metadata'; }
            if (path) file = path[2];
            inspect(line, `Git history ${commit}:${file}`);
          }
        } else {
          for (const marker of text.matchAll(/^(?:commit ([a-f0-9]{40})|diff --git a\/.*? b\/(.*))$/gm)) {
            if (marker[1]) { commit = marker[1]; file = 'metadata'; }
            else file = marker[2];
          }
        }
        tail = text.slice(-8192);
      });
      child.stderr.resume();
      child.on('error', () => reject(new Error('Unable to scan Git history')));
      child.on('close', code => code === 0 ? success() : reject(new Error('Git history scan failed')));
    });
  }
  return { findings: [...findings].map(([file, rules]) => ({ file, rules })), files: files.length, artifacts: built.length, history, configuredComparison: known.privateValues.length > 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await scanRepository(process.cwd(), { history: !process.argv.includes('--no-history'), artifacts: process.argv.includes('--artifacts') });
    // Findings contain locations and fixed rule IDs only, never matched text.
    console.log(JSON.stringify(result, null, 2));
    if (result.findings.length) process.exitCode = 1;
  } catch {
    console.error('Secret scan failed to complete. No credential contents were printed.');
    process.exitCode = 1;
  }
}
