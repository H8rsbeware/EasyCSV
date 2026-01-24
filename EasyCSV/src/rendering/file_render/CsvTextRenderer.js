import { TextFileRenderer } from './TextFileRenderer.js';

class CsvTextRenderer extends TextFileRenderer {
	constructor(options = {}) {
		super(options);
		this.delimiter = ',';
	}

	setDelimiter(delimiter) {
		this.delimiter = delimiter || ',';
	}

	tokenizeLine(line) {
		const tokens = [];
		let inQuotes = false;
		let colIndex = 0;
		let fieldStart = 0;

		for (let i = 0; i < line.length; i += 1) {
			const ch = line[i];

			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					i += 1;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (ch === this.delimiter && !inQuotes) {
				tokens.push({
					type: `csv${colIndex % 8}`,
					value: line.slice(fieldStart, i),
				});
				tokens.push({ type: 'csv-delim', value: this.delimiter });
				colIndex += 1;
				fieldStart = i + 1;
			}
		}

		tokens.push({
			type: `csv${colIndex % 8}`,
			value: line.slice(fieldStart),
		});

		return tokens;
	}

	emitTextChange(filePath, text) {
		if (typeof this.onTextChange !== 'function') return;
		this.onTextChange({ filePath, text, delimiter: this.delimiter });
	}
}

export { CsvTextRenderer };
