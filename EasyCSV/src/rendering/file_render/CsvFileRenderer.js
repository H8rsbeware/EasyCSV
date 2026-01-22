import { FileRenderBase } from './FileRenderBase.js';

class CsvFileRenderer extends FileRenderBase {
	// Simple CSV/TSV parser with quote support and newline handling.
	parseDelimited(text, delimiter) {
		const rows = [];
		let row = [];
		let field = '';
		let inQuotes = false;

		for (let i = 0; i < text.length; i += 1) {
			const ch = text[i];

			if (inQuotes) {
				if (ch === '"') {
					const next = text[i + 1];
					if (next === '"') {
						field += '"';
						i += 1;
					} else {
						inQuotes = false;
					}
				} else {
					field += ch;
				}
				continue;
			}

			if (ch === '"') {
				inQuotes = true;
				continue;
			}

			if (ch === delimiter) {
				row.push(field);
				field = '';
				continue;
			}

			if (ch === '\r') {
				const next = text[i + 1];
				if (next === '\n') i += 1;
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
				continue;
			}

			if (ch === '\n') {
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
				continue;
			}

			field += ch;
		}

		row.push(field);
		rows.push(row);
		return rows;
	}

	render(container, text, delimiter) {
		const rows = this.parseDelimited(text, delimiter);
		this.renderCsv(container, rows);
	}

	renderCsv(container, rows) {
		container.innerHTML = '';

		const table = document.createElement('table');
		table.className = 'csv-table';

		// Keep tables lightweight; CSVs can be huge.
		const maxRows = 1000;
		const limited = rows.length > maxRows;
		const visibleRows = limited ? rows.slice(0, maxRows) : rows;

		const maxCols = visibleRows.reduce((m, r) => Math.max(m, r.length), 0);

		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');

		visibleRows.forEach((row, rowIndex) => {
			const tr = document.createElement('tr');

			const rowNum = document.createElement(rowIndex === 0 ? 'th' : 'td');
			rowNum.className = 'csv-table__rownum';
			rowNum.textContent = String(rowIndex + 1);
			tr.appendChild(rowNum);

			for (let c = 0; c < maxCols; c += 1) {
				const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
				cell.textContent = row[c] ?? '';
				tr.appendChild(cell);
			}

			if (rowIndex === 0) {
				thead.appendChild(tr);
			} else {
				tbody.appendChild(tr);
			}
		});

		table.appendChild(thead);
		table.appendChild(tbody);
		container.appendChild(table);

		if (limited) {
			const note = document.createElement('div');
			note.className = 'csv-table__note';
			note.textContent = `Showing first ${maxRows} rows (${rows.length} total).`;
			container.appendChild(note);
		}
	}
}

export { CsvFileRenderer };
