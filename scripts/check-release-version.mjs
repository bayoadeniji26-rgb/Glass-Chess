import { readFile } from 'node:fs/promises';

const [versionSource, manifestSource, indexSource] = await Promise.all([
  readFile(new URL('../src/version.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/version.json', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8')
]);

const sourceVersion = versionSource.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const manifestVersion = JSON.parse(manifestSource).version;
const htmlVersion = indexSource.match(/name="glass-chess-version" content="([^"]+)"/)?.[1];

if (!sourceVersion || sourceVersion !== manifestVersion || sourceVersion !== htmlVersion) {
  throw new Error(
    \`Release version mismatch: src/version.js=\${sourceVersion || 'missing'}, public/version.json=\${manifestVersion || 'missing'}, index.html=\${htmlVersion || 'missing'}\`
  );
}

console.log(\`Release version consistent: \${sourceVersion}\`);
