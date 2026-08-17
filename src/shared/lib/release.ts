export const checkVersions = (tag: string, versions: Record<string, string>): void => {
  const wanted = tag.replace(/^v/, '');
  const off = Object.entries(versions).filter(([, version]) => version !== wanted);
  if (off.length > 0) {
    const listed = off.map(([file, version]) => `${file} ${version}`).join(' / ');
    throw new Error(`tag ${tag} != ${listed}`);
  }
};
