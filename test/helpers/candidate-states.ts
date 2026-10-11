import type { ViewState } from '../../core/render/stateful.ts';

export const candidateStateHtml = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reading log</title>
<style>
* { box-sizing: border-box } body { margin: 0; background: #f3f0e9; color: #242923; font: 18px Georgia, serif }
main { max-width: 880px; margin: auto; padding: 32px 24px } h1 { margin: 0 0 24px }
section { background: #fffefa; padding: 24px; margin-bottom: 24px }
article { padding: 12px 0 } h2 { font-size: 22px } p { line-height: 1.5 }
button, input, textarea { font: 16px system-ui; padding: 10px; max-width: 100% }
label { display: block; margin: 18px 0 } textarea { display: block; width: 100%; height: 160px }
</style>
<main><h1>Reading log</h1><section id="list"><h2>Currently reading</h2>
<article><strong>The Left Hand of Darkness</strong><p>Ursula K. Le Guin · page 84 of 304</p>
<button id="edit">Edit reading progress</button></article>
<article><strong>A Field Guide to Getting Lost</strong><p>Rebecca Solnit · page 32 of 224</p></article>
<h2>Finished this month</h2><article><strong>Ways of Seeing</strong><p>John Berger · completed</p></article></section>
<section id="editor" hidden><h2>Edit reading progress</h2><p>The Left Hand of Darkness</p>
<label>Page reached <input id="page" type="number" value="84"></label>
<label>Reading notes <textarea>Winter landscapes and unfamiliar customs.</textarea></label>
<button id="close">Save and return to books</button></section></main>
<script>
document.querySelector('#edit').onclick = () => {
  document.querySelector('#list').hidden = true; document.querySelector('#editor').hidden = false;
  history.pushState({}, '', '/books#edit');
};
document.querySelector('#close').onclick = () => {
  document.querySelector('#editor').hidden = true; document.querySelector('#list').hidden = false;
  history.pushState({}, '', '/books');
};
</script></html>`;

export const candidateCaptureStates: ViewState[] = [
  {
    name: 'collapsed-list', startRoute: '/books', route: '/books', actions: [],
    assertions: [{ selector: '#list', state: 'visible', text: 'Finished this month' },
      { selector: '#editor', state: 'hidden' }],
  },
  {
    name: 'expanded-editor', startRoute: '/books', route: '/books#edit',
    actions: [{ kind: 'click', selector: '#edit' }],
    assertions: [{ selector: '#editor', state: 'visible', text: 'Page reached' },
      { selector: '#list', state: 'hidden' }],
  },
];
