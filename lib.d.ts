declare module 'zip' {
	export interface IReader {
		toObject(): any;
		iterator(): Iterable<Entry>;
		forEach(callback: (entry: Entry) => void): void;
	}
	export function Reader(buf: Buffer): IReader;

	export interface Entry {
		getData(): Buffer;
		getName(): string;
		getMode(): number;
		lastModified(): Date;
		isDirectory(): boolean;
		isFile(): boolean;
	}
}
