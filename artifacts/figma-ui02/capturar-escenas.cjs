const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function capture() {
  const location = pathToFileURL(path.join(__dirname, 'escenas.html')).href;
  const output = path.join(__dirname, '..', 'capturas-figma');
  const icons = JSON.parse(await fs.readFile(path.join(__dirname, 'icons.json'), 'utf8'));
  const map = (await fs.readFile(path.join(__dirname, 'bagua-original.svg'), 'utf8'))
    .replace('id="agua-Overture" fill="#C8DFE1" stroke="none" stroke-width="0"',
      'id="agua-Overture" fill="none" stroke="#B0D1D6" stroke-width="12"')
    .replace('fill="#EEF0EC"', 'fill="#EEF0F4"')
    .replace('fill="#D2D8D4" stroke="#BDC8C0"', 'fill="#D4D9E3" stroke="#BDC6D6"')
    .replace('fill="#68B49B" stroke="#176D55"', 'fill="#ABB3F8" stroke="#414BB3"');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1760, height: 990 } });
    async function open(suffix = '') {
      await page.goto(location + suffix);
      await page.evaluate(({ icons, map }) => {
        document.querySelector('#map').insertAdjacentHTML('afterbegin', map);
        for (const element of document.querySelectorAll('[data-icon]')) {
          element.classList.add('icon');
          element.innerHTML = icons[element.dataset.icon].replace('stroke="#53645E"', 'stroke="currentColor"');
        }
      }, { icons, map });
    }
    async function shot(selector, filename) {
      const bounds = await page.locator(selector).boundingBox();
      const viewport = page.viewportSize();
      assert(bounds && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
      await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
    }
    await open();
    const result = page.getByRole('button', { name: /Predio P-01428/ });
    const inspector = page.getByRole('complementary', { name: /Ficha territorial/ });
    assert.equal(await inspector.isVisible(), false);
    await result.click();
    assert(await inspector.isVisible());
    const panel = await inspector.boundingBox();
    assert(panel.y + panel.height < 965);
    assert.equal(await inspector.getByText('Registrada', { exact: true }).count(), 2);
    assert.doesNotMatch(await inspector.innerText(), /\b(?:peso|kg)\b/i);
    await shot('#desktop', 'UI-11 - Busqueda en mapa y ficha con entregas.png');

    await page.setViewportSize({ width: 1070, height: 990 });
    await open('?mobile');
    const qr = page.getByRole('img', { name: 'QR de PA-01428-U01' });
    assert(await qr.evaluate(image => image.complete && image.naturalWidth > 0));
    assert.doesNotMatch(await page.locator('#mobile').innerText(), /\b(?:peso|kg)\b/i);
    await shot('#mobile', 'UI-12 - Escaneo QR y registro movil.png');
    await page.getByRole('button', { name: 'Confirmar punto de atención' }).click();
    assert(await page.getByLabel(/Observación/).evaluate(element => document.activeElement === element));
    await page.getByRole('button', { name: 'Guardar entrega' }).click();
    assert(await page.getByRole('button', { name: /Entrega registrada en la demostración/ }).isVisible());
  } finally {
    await browser.close();
  }
}
capture().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
