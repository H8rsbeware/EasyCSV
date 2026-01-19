export function cloneTemplate(id) {
	const tpl = document.getElementById(id);
	if (!tpl) {
		throw new Error(`Missing template: ${id}`);
	}
	return tpl.content.firstElementChild.cloneNode(true);
}

export function wireActions(rootEl, handlers) {
	rootEl.querySelectorAll('[data-action]').forEach((el) => {
		const action = el.getAttribute('data-action');
		const fn = handlers[action];
		if (typeof fn === 'function') {
			el.addEventListener('click', fn);
		}
	});
}
