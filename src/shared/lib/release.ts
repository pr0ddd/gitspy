export const checkVersions = (tag: string, pkg: string, conf: string): void => {
  const wanted = tag.replace(/^v/, '');
  if (pkg !== wanted || conf !== wanted) {
    throw new Error(`tag ${tag} != package.json ${pkg} / tauri.conf.json ${conf}`);
  }
};
