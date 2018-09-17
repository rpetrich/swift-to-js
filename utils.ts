export function expectLength<T extends ReadonlyArray<any>>(array: T, ...lengths: number[]) {
	for (const length of lengths) {
		if (array.length === length) {
			return;
		}
	}
	console.error(array);
	throw new Error(`Expected ${lengths.join(" or ")} items, but got ${array.length}`);
}

export function concat<T>(head: T[], tail: T[]): T[];
export function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T>;
export function concat<T>(head: ReadonlyArray<T>, tail: ReadonlyArray<T>): ReadonlyArray<T> | T[] {
	if (head.length) {
		return tail.length ? head.concat(tail) : head;
	} else {
		return tail;
	}
}

export function cached<T>(fn: () => T): () => T {
	let populated = false;
	let value: T | undefined;
	return () => {
		if (!populated) {
			value = fn();
			populated = true;
		}
		return value as T;
	};
}

export function lookupForMap<V>(map: { [key: string]: V }): (key: string) => V | undefined {
	return (key: string) => Object.hasOwnProperty.call(map, key) ? map[key] : undefined;
}
