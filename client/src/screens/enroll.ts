import { playClip } from '../audio/audio';
import { el } from '../dom';
import { enroll, fetchSites } from '../enroll/api';
import { photoToDataUrl } from '../enroll/photo';
import { t, type Lang } from '../i18n';

// Each button is written and spoken in its own language, so a worker who cannot read
// the others can still pick theirs. Santali is Ol Chiki script (font bundled in style.css).
const LANGUAGES: { lang: Lang; label: string; sub: string; cls: string }[] = [
  { lang: 'sat', label: 'ᱥᱟᱱᱛᱟᱲᱤ', sub: 'Santali', cls: 'ol-chiki' },
  { lang: 'hi', label: 'हिन्दी', sub: 'Hindi', cls: '' },
  { lang: 'en', label: 'English', sub: 'English', cls: '' },
];

/** Two steps: pick a language (tap = hear it), then name, employer ID, site and photo. */
export function renderEnroll(root: HTMLElement, onDone: () => void) {
  let lang: Lang | null = null;
  chooseLanguage();

  function chooseLanguage() {
    root.replaceChildren();
    const card = el('main', undefined, 'enroll');
    card.append(el('h1', 'Aotan'));
    const list = el('div', undefined, 'langs');
    const next = el('button', 'Continue ›');
    next.disabled = true;

    for (const l of LANGUAGES) {
      const b = el('button', undefined, 'lang');
      b.append(el('span', l.label, `lang-label ${l.cls}`), el('span', l.sub, 'lang-sub'));
      b.onclick = () => {
        lang = l.lang;
        list.querySelectorAll('.lang').forEach((x) => x.classList.toggle('selected', x === b));
        next.disabled = false;
        void playClip(l.lang, `lang_${l.lang}`);
      };
      list.append(b);
    }
    next.onclick = () => lang && details(lang);
    card.append(list, next);
    root.append(card);
  }

  async function details(chosen: Lang) {
    root.replaceChildren();
    const card = el('main', undefined, 'enroll');
    card.append(el('h1', t(chosen, 'enrollTitle')));

    const form = el('form');
    const field = (label: string, input: HTMLElement) => {
      const wrap = el('label', undefined, 'field');
      wrap.append(el('span', label), input);
      return wrap;
    };
    const name = el('input');
    name.autocomplete = 'name';
    const employerId = el('input');
    const site = el('select');
    const siteField = field(t(chosen, 'site'), site);
    siteField.hidden = true;
    site.append(new Option(t(chosen, 'siteNone'), ''));

    // Selfie camera on phones; falls back to the file picker elsewhere.
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.setAttribute('capture', 'user');
    file.hidden = true;
    const preview = el('img', undefined, 'photo');
    preview.hidden = true;
    const photoBtn = el('button', t(chosen, 'takePhoto'), 'secondary');
    photoBtn.type = 'button';
    photoBtn.onclick = () => file.click();
    let photo = '';
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      photo = await photoToDataUrl(f);
      preview.src = photo;
      preview.hidden = false;
      photoBtn.textContent = t(chosen, 'retakePhoto');
    };

    const message = el('p', undefined, 'note');
    const submit = el('button', t(chosen, 'enroll'));
    submit.type = 'submit';
    form.append(field(t(chosen, 'name'), name), field(t(chosen, 'employerId'), employerId), siteField, el('p', t(chosen, 'photo'), 'field-label'), preview, photoBtn, file, message, submit);
    card.append(form);
    root.append(card);

    void fetchSites().then((sites) => {
      for (const s of sites) site.append(new Option(s.district ? `${s.name} (${s.district})` : s.name, String(s.id)));
      siteField.hidden = sites.length === 0;
    });

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!name.value.trim() || !employerId.value.trim() || !photo) {
        message.textContent = t(chosen, 'needAll');
        return;
      }
      submit.disabled = true;
      submit.textContent = t(chosen, 'enrolling');
      message.textContent = '';
      const result = await enroll({
        name: name.value.trim(),
        employerId: employerId.value.trim(),
        siteId: site.value ? Number(site.value) : null,
        lang: chosen,
        photo,
      });
      if (result.ok) return onDone();
      message.textContent = t(chosen, result.reason === 'offline' ? 'needOnline' : 'enrollFailed');
      submit.disabled = false;
      submit.textContent = t(chosen, 'enroll');
    };
  }
}
