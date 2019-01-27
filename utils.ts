export function expectLength<T extends ReadonlyArray<unknown>>(array: T, ...lengths: number[]) {
	for (const length of lengths) {
		if (array.length === length) {
			return;
		}
	}
	console.error(array);
	throw new Error(`Expected ${lengths.join(" or ")} items, but got ${array.length}`);
}

export function concat<T>(first: T[], ...rest: T[][]): T[];
export function concat<T>(first: ReadonlyArray<T>, ...rest: Array<ReadonlyArray<T>>): ReadonlyArray<T>;
export function concat<T>(first: ReadonlyArray<T>, ...rest: Array<ReadonlyArray<T>>): ReadonlyArray<T> {
	let result = first;
	for (const other of rest) {
		if (other.length !== 0) {
			result = result.length !== 0 ? result.concat(other) : other;
		}
	}
	return result;
}

export function lookupForMap<V>(map: { readonly [key: string]: V }): (key: string) => V | undefined {
	return (key: string) => Object.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function toLowerCase(text: string): string {
	return text.toLowerCase();
}

export function camelCase(text: string): string {
	return text.replace(/^[^a-z]/, toLowerCase);
}
