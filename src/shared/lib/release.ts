export type ManifestInput = {
  version: string;
  baseUrl: string;
  artifact: string;
  signature: string;
  date: string;
};

export type Manifest = {
  version: string;
  pub_date: string;
  platforms: Record<string, { url: string; signature: string }>;
};

export const buildManifest = ({
  version,
  baseUrl,
  artifact,
  signature,
  date,
}: ManifestInput): Manifest => ({
  version: version.replace(/^v/, ''),
  pub_date: date,
  platforms: {
    'darwin-aarch64': { url: `${baseUrl}/${artifact}`, signature },
  },
});

export const checkVersions = (tag: string, pkg: string, conf: string): void => {
  const wanted = tag.replace(/^v/, '');
  if (pkg !== wanted || conf !== wanted) {
    throw new Error(`tag ${tag} != package.json ${pkg} / tauri.conf.json ${conf}`);
  }
};
