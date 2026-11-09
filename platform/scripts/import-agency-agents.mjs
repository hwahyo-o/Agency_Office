import { setTimeout as delay } from 'node:timers/promises';

const source = 'https://api.github.com/repos/msitarzewski/agency-agents';
const rawSource = 'https://raw.githubusercontent.com/msitarzewski/agency-agents/main';
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  if (response.status === 204) return null;

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return response.text();
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (!match) {
    return null;
  }

  const fields = Object.fromEntries(
    match[1].split(/\r?\n/).flatMap((line) => {
      const field = line.match(/^([\w-]+):\s*(.*)$/);

      if (!field) {
        return [];
      }

      return [[field[1], field[2].trim().replace(/^['"]|['"]$/g, '')]];
    }),
  );

  if (!fields.name || !fields.description) {
    return null;
  }

  return fields;
}

async function importLicense() {
  const licenseText = await fetchText(`${rawSource}/LICENSE`);
  const response = await fetchJson(
    `${supabaseUrl}/rest/v1/agent_source_licenses?on_conflict=source_repo`,
    {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        source_repo: 'https://github.com/msitarzewski/agency-agents',
        license_name: 'MIT',
        license_text: licenseText,
        source_revision: (await fetchJson(`${source}/commits/main`)).sha,
      }]),
    },
  );

  return response;
}

async function importAgents() {
  const [divisionData, tree] = await Promise.all([
    fetchJson(`${source}/contents/divisions.json`),
    fetchJson(`${source}/git/trees/main?recursive=1`),
  ]);
  const divisions = Object.keys(JSON.parse(Buffer.from(divisionData.content, 'base64').toString()).divisions);
  const paths = tree.tree
    .filter((file) => file.type === 'blob' && file.path.endsWith('.md'))
    .filter((file) => divisions.includes(file.path.split('/')[0]));

  let imported = 0;
  let skipped = 0;

  for (let index = 0; index < paths.length; index += 20) {
    const batchPaths = paths.slice(index, index + 20);
    const batch = await Promise.all(batchPaths.map(async (file) => {
      const markdown = await fetchText(`${rawSource}/${file.path}`);
      const metadata = parseFrontmatter(markdown);

      if (!metadata) {
        skipped += 1;
        return null;
      }

      return {
        source_path: file.path,
        source_url: `https://github.com/msitarzewski/agency-agents/blob/main/${file.path}`,
        source_revision: tree.sha,
        division: file.path.split('/')[0],
        role_name: metadata.name,
        description: metadata.description,
        emoji: metadata.emoji || null,
        color: metadata.color || null,
        vibe: metadata.vibe || null,
        instructions_markdown: markdown,
        is_active: true,
      };
    }));

    const records = batch.filter(Boolean);

    if (records.length === 0) {
      continue;
    }

    await fetchJson(
      `${supabaseUrl}/rest/v1/agent_templates?on_conflict=source_path`,
      {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(records),
      },
    );

    imported += records.length;
    console.log(`Imported ${imported} employee profiles.`);

    if (index + 20 < paths.length) {
      await delay(100);
    }
  }

  console.log(`Finished: ${imported} profiles imported; ${skipped} non-profile Markdown files skipped.`);
}

await importLicense();
await importAgents();
