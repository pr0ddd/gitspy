const HEADING = /^## +(\S+)(?: +[—-] +(\d{4}-\d{2}-\d{2}))? *$/;

export const parseReleases = (text) => {
  const releases = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      const heading = HEADING.exec(line);
      if (!heading) {
        throw new Error(`changelog heading must read "## <version> — <YYYY-MM-DD>": ${line}`);
      }
      current = { version: heading[1], date: heading[2] ?? null, body: [] };
      releases.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return releases.map(({ version, date, body }) => ({
    version,
    date,
    body: body.join('\n').trim(),
  }));
};

export const notesFor = (text, version) => {
  const wanted = version.replace(/^v/, '');
  const release = parseReleases(text).find((entry) => entry.version === wanted);
  if (!release?.date) {
    throw new Error(`CHANGELOG.md has no released section "## ${wanted} — <date>"`);
  }
  if (!release.body) throw new Error(`section "## ${wanted}" in CHANGELOG.md is empty`);
  return release.body;
};
