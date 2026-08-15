export type Release = { version: string; date: string | null; body: string };

export declare const parseReleases: (text: string) => Release[];
export declare const notesFor: (text: string, version: string) => string;
