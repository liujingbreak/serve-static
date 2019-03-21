export interface CacheEntry {
	data: Buffer;
	lastModified: Date;
	name: string;
	isDirectory: boolean;
  }
