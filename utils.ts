export function expectLength<T extends ReadonlyArray<any>>(array: T, ...lengths: number[]) {
	for (const length of lengths) {
		if (array.length === length) {
			return;
		}
	}
	console.error(array);
	throw new Error(`Expected ${lengths.join(" or ")} items, but got ${array.length}`);
}
