// Shared helpers for file renderers.
class FileRenderBase {
	// Minimal tokenizer for simple coloring: strings and numbers only.
	tokenizeLine(line) {
		const tokens = [];
		let i = 0;

		const pushPlain = (start, end) => {
			if (end > start) {
				tokens.push({ type: 'plain', value: line.slice(start, end) });
			}
		};

		while (i < line.length) {
			const ch = line[i];

			if (ch === '"' || ch === "'") {
				const quote = ch;
				let j = i + 1;
				while (j < line.length) {
					if (line[j] === quote && line[j - 1] !== '\\') break;
					j += 1;
				}
				const end = j < line.length ? j + 1 : line.length;
				pushPlain(0, i);
				tokens.push({ type: 'string', value: line.slice(i, end) });
				line = line.slice(end);
				i = 0;
				continue;
			}

			if (
				(ch >= '0' && ch <= '9') ||
				(ch === '-' && line[i + 1] >= '0' && line[i + 1] <= '9')
			) {
				let j = i + 1;
				while (j < line.length) {
					const c = line[j];
					if ((c >= '0' && c <= '9') || c === '.' || c === '_') {
						j += 1;
						continue;
					}
					break;
				}
				pushPlain(0, i);
				tokens.push({ type: 'number', value: line.slice(i, j) });
				line = line.slice(j);
				i = 0;
				continue;
			}

			i += 1;
		}

		if (line.length) {
			tokens.push({ type: 'plain', value: line });
		}

		return tokens;
	}
}

export { FileRenderBase };
