async function loadProducts() {
  const res = await fetch('./data/products.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load products.json');
  return res.json();
}

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, String(v));
  }
  return node;
}

function renderProductCard(product) {
  const card = el('article', 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden');

  const imgSrc = (product.images && product.images[0]) ? product.images[0] : '';
  const img = el('img', 'w-full h-56 object-cover bg-slate-100', { src: imgSrc, alt: product.name, loading: 'lazy' });

  const body = el('div', 'p-5 space-y-3');
  body.appendChild(el('h3', 'text-lg font-semibold text-slate-900', { text: product.name }));
  body.appendChild(el('p', 'text-sm text-slate-600', { text: product.description }));

  const actions = el('div', 'flex flex-wrap gap-2 pt-2');

  if (product.generatorLink) {
    actions.appendChild(
      el('a', 'inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800', {
        href: product.generatorLink,
        text: 'Open Generator'
      })
    );
  }

  if (product.whatsapp) {
    actions.appendChild(
      el('a', 'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50', {
        href: product.whatsapp,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'WhatsApp'
      })
    );
  }

  body.appendChild(actions);

  // Optional GLB preview link
  if (product.glb) {
    const preview = el('a', 'text-sm text-indigo-600 hover:underline', {
      href: product.glb,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'View GLB model'
    });
    body.appendChild(preview);
  }

  card.appendChild(img);
  card.appendChild(body);
  return card;
}

async function main() {
  const grid = document.getElementById('productsGrid');
  const errorBox = document.getElementById('productsError');

  try {
    const data = await loadProducts();
    const products = data.products || [];

    if (!products.length) {
      grid.appendChild(el('p', 'text-slate-600', { text: 'No products found. Edit data/products.json to add items.' }));
      return;
    }

    for (const p of products) grid.appendChild(renderProductCard(p));
  } catch (err) {
    console.error(err);
    if (errorBox) {
      errorBox.classList.remove('hidden');
      errorBox.textContent = `Failed to load products: ${err.message}`;
    }
  }
}

main();
