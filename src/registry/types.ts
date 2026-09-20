export interface RegistryEntry {
  id: string;
  name?: string;
  path: string;
  match: {
    hosts: string[];
    urlPatterns?: string[];
    fingerprints?: string[];
  };
}

export interface RegistryFile {
  generatedAt: string;
  entries: RegistryEntry[];
}
