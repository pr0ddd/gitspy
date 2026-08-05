export type ManifestInput = {
  version: string;
  baseUrl: string;
  artifact: string;
  signature: string;
  date: string;
};

export declare const buildManifest: (input: ManifestInput) => {
  version: string;
  pub_date: string;
  platforms: Record<string, { url: string; signature: string }>;
};
