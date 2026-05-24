/* ============================================================
   script.js — CC101 Code Compiler
   Structură: Constante → Init editor → Model date → Compilare
   → Salvare → Butoane split → Panouri colapsabile → Render
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ── DEFINIȚIILE LIMBAJELOR ───────────────────────────────────
    const LIMBAJE = {
        cpp: {
            id: 'cpp', eticheta: 'C++', icona: 'devicon-cplusplus-plain',
            extensie: '.cpp', modCM: 'text/x-c++src', fisierPrincipal: 'main.cpp',
            hello:
`#include <iostream>
using namespace std;
int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
        },
        c: {
            id: 'c', eticheta: 'C', icona: 'devicon-c-plain',
            extensie: '.c', modCM: 'text/x-csrc', fisierPrincipal: 'main.c',
            hello:
`#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
        },
        python: {
            id: 'python', eticheta: 'Python', icona: 'devicon-python-plain',
            extensie: '.py', modCM: 'text/x-python', fisierPrincipal: 'main.py',
            hello: `print("Hello, World!")`,
        },
        java: {
            id: 'java', eticheta: 'Java', icona: 'devicon-java-plain',
            extensie: '.java', modCM: 'text/x-java', fisierPrincipal: 'Main.java',
            hello:
`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
        },
        rust: {
            id: 'rust', eticheta: 'Rust', icona: 'devicon-rust-plain',
            extensie: '.rs', modCM: 'text/x-rustsrc', fisierPrincipal: 'main.rs',
            hello:
`fn main() {
    println!("Hello, World!");
}`,
        },
    };

    let limbajCurent = LIMBAJE.cpp;

    // ── INIȚIALIZARE CODEMIRROR ──────────────────────────────────
    const sursa = document.getElementById('sursa-editor');
    if (!sursa) { console.error('Textarea-ul editorului nu a fost găsit!'); return; }

    const editor = CodeMirror.fromTextArea(sursa, {
        lineNumbers: true,
        mode: limbajCurent.modCM,
        theme: 'dracula',
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: true,
        lineWrapping: true,
    });
    editor.setSize('100%', '96%');

    // Referințe DOM frecvent folosite
    const zonaOutput      = document.getElementById('zona-output');
    const inputStdin      = document.getElementById('text-stdin');
    const containerTaburi = document.getElementById('container-taburi');
    const listaFisiere    = document.getElementById('lista-fisiere');
    const inputFisier     = document.getElementById('input-fisier');
    const butonUpload     = document.getElementById('buton-upload-fisier');

    // ── MODELUL DE DATE AL PROIECTULUI ───────────────────────────
    // dateiFisiere → Map<numeFisier, continut>  — toate fișierele din proiect
    // tabluriDeschise → Set<numeFisier>         — fișierele cu tab activ (ordinea contează)
    const dateiFisiere    = new Map();
    const tabluriDeschise = new Set();
    let   fisierActiv     = limbajCurent.fisierPrincipal;

    dateiFisiere.set(limbajCurent.fisierPrincipal, limbajCurent.hello);
    tabluriDeschise.add(limbajCurent.fisierPrincipal);
    editor.setValue(limbajCurent.hello);

    // ── COMPILARE ────────────────────────────────────────────────
    function compileaza(mode) {
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        const stdin = inputStdin ? inputStdin.value : '';

        zonaOutput.innerHTML = '';
        adaugaOutput(
            mode === 'proiect'
                ? `Compilare proiect (${limbajCurent.eticheta})... ⏳`
                : `Compilare fișier activ (${limbajCurent.eticheta})... ⏳`,
            'astept'
        );

        let corpCerere;

        if (mode === 'proiect') {
            const fisiereSursa = [];
            dateiFisiere.forEach((continut, numeFisier) => {
                // Trimitem sursele (.cpp etc.) DAR și header-ele (.h, .hpp)
                const ext = numeFisier.split('.').pop().toLowerCase();
                const deTrimis = [limbajCurent.extensie.replace('.', ''), 'h', 'hpp'];
                if (deTrimis.includes(ext))
                    fisiereSursa.push({ name: numeFisier, content: continut });
            });

            if (fisiereSursa.length === 0) {
                zonaOutput.innerHTML = '';
                adaugaOutput(`Nu există fișiere ${limbajCurent.extensie} în proiect.`, 'eroare');
                return;
            }
            corpCerere = JSON.stringify({ language: limbajCurent.id, files: fisiereSursa, stdin });
        } else {
            corpCerere = JSON.stringify({ language: limbajCurent.id, code: editor.getValue(), stdin });
        }

        fetch('http://127.0.0.1:3000/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: corpCerere,
        })
        .then(r => { if (!r.ok) throw new Error(`Eroare server: ${r.status}`); return r.json(); })
        .then(date => {
            zonaOutput.innerHTML = '';
            const esteEroare = /error:|Eroare|⏱/i.test(date.output);
            adaugaOutput(date.output, esteEroare ? 'eroare' : 'succes');
        })
        .catch(err => {
            console.error(err);
            zonaOutput.innerHTML = '';
            adaugaOutput('Eroare de conexiune! Verifică că server.js rulează (F12 pentru detalii).', 'eroare');
        });
    }

    function adaugaOutput(text, tip) {
        const bloc = document.createElement('pre');
        bloc.className = `bloc-output ${tip}`;
        bloc.textContent = text;
        zonaOutput.appendChild(bloc);
    }

    // ── SALVARE ──────────────────────────────────────────────────
    function salveaza(mode) {
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        if (mode === 'fisier') {
            descarcaBlob(fisierActiv || 'untitled', dateiFisiere.get(fisierActiv) || '');
        } else {
            const zip = new JSZip();
            dateiFisiere.forEach((continut, nume) => zip.file(nume, continut));
            zip.generateAsync({ type: 'blob' })
               .then(blob => descarcaBlob('proiect.zip', blob, true));
        }
    }

    function descarcaBlob(numeFisier, date, esteBlob = false) {
        const blob = esteBlob ? date : new Blob([date], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: numeFisier });
        link.click();
        URL.revokeObjectURL(url);
    }

    // ── BUTOANE SPLIT ────────────────────────────────────────────
    function initButonSplit(idPrincipal, idSageata, idDropdown, actiuneImplicita) {
        const btnPrincipal = document.getElementById(idPrincipal);
        const btnSageata   = document.getElementById(idSageata);
        const dropdown     = document.getElementById(idDropdown);

        btnPrincipal.addEventListener('click', () => actiuneImplicita());

        btnSageata.addEventListener('click', e => {
            e.stopPropagation();
            const eraDeschi = dropdown.classList.contains('deschis');
            inchideToateDropdown();
            if (!eraDeschi) dropdown.classList.add('deschis');
        });

        dropdown.querySelectorAll('.optiune-dropdown').forEach(optiune => {
            optiune.addEventListener('click', () => {
                const actiune = optiune.dataset.actiune;
                inchideToateDropdown();
                if (actiune === 'ruleaza-fisier')   compileaza('fisier');
                if (actiune === 'ruleaza-proiect')  compileaza('proiect');
                if (actiune === 'salveaza-fisier')  salveaza('fisier');
                if (actiune === 'salveaza-proiect') salveaza('proiect');
            });
        });
    }

    function inchideToateDropdown() {
        document.querySelectorAll('.meniu-dropdown.deschis')
                .forEach(d => d.classList.remove('deschis'));
    }
    document.addEventListener('click', inchideToateDropdown);

    initButonSplit('buton-salveaza', 'sageata-salvare', 'dropdown-salvare', () => salveaza('fisier'));
    initButonSplit('buton-ruleaza',  'sageata-rulare',  'dropdown-rulare',  () => compileaza('fisier'));

    // ── PANOURI COLAPSABILE ──────────────────────────────────────
    function initPanouColapsabil(idToggle, idPanou, idSageata, deschisImplicit = false) {
        const toggle  = document.getElementById(idToggle);
        const panou   = document.getElementById(idPanou);
        const sageata = document.getElementById(idSageata);
        let esteDeschi = deschisImplicit;

        if (esteDeschi) {
            panou.style.maxHeight = panou.scrollHeight + 'px';
            if (sageata) sageata.style.transform = 'rotate(180deg)';
        }

        toggle.addEventListener('click', () => {
            esteDeschi = !esteDeschi;
            panou.style.maxHeight = esteDeschi ? panou.scrollHeight + 'px' : '0';
            if (sageata) sageata.style.transform = esteDeschi ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        return () => esteDeschi;
    }

    const esteDeschisFisiere = initPanouColapsabil('toggle-fisiere', 'panou-fisiere', 'sageata-fisiere', false);
    initPanouColapsabil('toggle-limbaj', 'panou-limbaj', 'sageata-limbaj');
    initPanouColapsabil('toggle-setari', 'panou-setari', 'sageata-setari');

    // ── PANOUL STDIN ─────────────────────────────────────────────
    const baraStin  = document.getElementById('bara-stdin');
    const corpStdin = document.getElementById('corp-stdin');
    const sagStdin  = document.getElementById('sageata-stdin');
    let stdinDeschi = false;

    baraStin.addEventListener('click', () => {
        stdinDeschi = !stdinDeschi;
        corpStdin.style.maxHeight = stdinDeschi ? corpStdin.scrollHeight + 'px' : '0';
        sagStdin.style.transform  = stdinDeschi ? 'rotate(180deg)' : 'rotate(0deg)';
        if (stdinDeschi) setTimeout(() => inputStdin.focus(), 150);
    });

    // ── SELECTAREA LIMBAJULUI ────────────────────────────────────
    const iconaLimbaj     = document.getElementById('icona-limbaj');
    const containerLimbaj = document.getElementById('optiuni-limbaj');
    const panouLimbaj     = document.getElementById('panou-limbaj');

    function construiesteOptiuniLimbaj() {
        containerLimbaj.innerHTML = '';
        Object.values(LIMBAJE).forEach(lang => {
            const btn = document.createElement('button');
            btn.className    = `buton-limbaj ${lang.id === limbajCurent.id ? 'activ' : ''}`;
            btn.dataset.lang = lang.id;
            btn.innerHTML    = `<i class="${lang.icona}"></i><span>${lang.eticheta}</span><small>${lang.extensie}</small>`;
            btn.addEventListener('click', () => schimbaLimbaj(lang.id));
            containerLimbaj.appendChild(btn);
        });
    }

    function schimbaLimbaj(idLimbaj) {
        if (idLimbaj === limbajCurent.id) return;
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        const limbajVechi = limbajCurent;
        const limbajNou   = LIMBAJE[idLimbaj];

        if (dateiFisiere.has(limbajVechi.fisierPrincipal)) {
            dateiFisiere.delete(limbajVechi.fisierPrincipal);
            tabluriDeschise.delete(limbajVechi.fisierPrincipal);
        }

        dateiFisiere.set(limbajNou.fisierPrincipal, limbajNou.hello);
        tabluriDeschise.add(limbajNou.fisierPrincipal);

        limbajCurent = limbajNou;
        fisierActiv  = limbajNou.fisierPrincipal;

        editor.setOption('mode', limbajNou.modCM);
        editor.setValue(limbajNou.hello);
        iconaLimbaj.className = limbajNou.icona;

        if (inputStdin) inputStdin.value = '';

        construiesteOptiuniLimbaj();
        randeazaTaburi();
        randeazaFisiereSidebar();

        if (panouLimbaj.style.maxHeight !== '0px')
            panouLimbaj.style.maxHeight = panouLimbaj.scrollHeight + 'px';
    }

    construiesteOptiuniLimbaj();

    // ── SETĂRI FONT ──────────────────────────────────────────────
    const zoneFontabile = [
        document.getElementById('bara-sus'),
        document.getElementById('zona-editor'),
        document.getElementById('panou-jos'),
        document.getElementById('zona-output'),
        document.getElementById('text-stdin'),
    ];
    const sidebarEl = document.getElementById('bara-laterala');

    function aplicaFont(valoareFont) {
        zoneFontabile.forEach(el => { if (el) el.style.fontFamily = valoareFont; });
        if (sidebarEl) sidebarEl.style.fontFamily = valoareFont;
        editor.getWrapperElement().style.fontFamily = valoareFont;
        editor.refresh();
    }

    document.querySelectorAll('.buton-font').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.buton-font').forEach(b => b.classList.remove('activ'));
            btn.classList.add('activ');
            aplicaFont(btn.dataset.font);
        });
    });

    // ── SETĂRI MĂRIME FONT ───────────────────────────────────────
    const sliderMarime = document.getElementById('slider-marime');
    const afisajMarime = document.getElementById('afisaj-marime');

    function aplicaMarime(valoare) {
        const n = parseInt(valoare, 10);
        zoneFontabile.forEach(el => { if (el) el.style.fontSize = n + 'px'; });
        editor.getWrapperElement().style.fontSize = n + 'px';
        editor.refresh();
        afisajMarime.textContent = n + 'px';

        if (sidebarEl) {
            const factor = (13 + (n - 13) * 0.5) / 13;
            sidebarEl.style.setProperty('--scale', factor);
        }
    }
    sliderMarime.addEventListener('input', () => aplicaMarime(sliderMarime.value));

    // ── SIDEBAR — TOGGLE RESTRÂNGERE ─────────────────────────────
    document.getElementById('buton-restrânge').addEventListener('click', () => {
        document.getElementById('container-principal').classList.toggle('meniu-inchis');
    });

    // ── UPLOAD FIȘIERE ───────────────────────────────────────────
    if (butonUpload && inputFisier) {
        butonUpload.addEventListener('click', () => inputFisier.click());
        inputFisier.addEventListener('change', e => {
            Array.from(e.target.files).forEach(fisier => {
                const cititor = new FileReader();
                cititor.onload = ev => adaugaFisier(fisier.name, ev.target.result);
                cititor.readAsText(fisier);
            });
            inputFisier.value = '';
        });
    }

    // ── OPERAȚIUNI CU FIȘIERE ────────────────────────────────────

    function adaugaFisier(numeFisier, continut) {
        let numeUnic = numeFisier;
        let n = 1;
        while (dateiFisiere.has(numeUnic)) {
            const punct = numeFisier.lastIndexOf('.');
            const baza  = punct >= 0 ? numeFisier.slice(0, punct) : numeFisier;
            const ext   = punct >= 0 ? numeFisier.slice(punct)    : '';
            numeUnic = `${baza}_${n}${ext}`;
            n++;
        }
        dateiFisiere.set(numeUnic, continut);
        tabluriDeschise.add(numeUnic);
        deschideFisier(numeUnic);
        randeazaFisiereSidebar();
    }

    function deschideFisier(numeFisier) {
        if (fisierActiv && dateiFisiere.has(fisierActiv))
            dateiFisiere.set(fisierActiv, editor.getValue());

        if (!tabluriDeschise.has(numeFisier)) tabluriDeschise.add(numeFisier);
        fisierActiv = numeFisier;
        editor.setValue(dateiFisiere.get(numeFisier));
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    function inchideTab(numeFisier, e) {
        e.stopPropagation();
        if (fisierActiv === numeFisier) dateiFisiere.set(numeFisier, editor.getValue());
        tabluriDeschise.delete(numeFisier);

        if (tabluriDeschise.size === 0) { reseteazaImplicit(); return; }

        if (fisierActiv === numeFisier) {
            const urmator = tabluriDeschise.values().next().value;
            fisierActiv = urmator;
            editor.setValue(dateiFisiere.get(urmator));
        }
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    function stergeFisier(numeFisier) {
        if (!confirm(`Ești sigur că vrei să ștergi "${numeFisier}" din proiect?\nAceastă acțiune este ireversibilă.`)) return;

        dateiFisiere.delete(numeFisier);
        tabluriDeschise.delete(numeFisier);

        if (dateiFisiere.size === 0) { reseteazaImplicit(); return; }

        if (fisierActiv === numeFisier) {
            const urmator = tabluriDeschise.size > 0
                ? tabluriDeschise.values().next().value
                : dateiFisiere.keys().next().value;
            if (!tabluriDeschise.has(urmator)) tabluriDeschise.add(urmator);
            fisierActiv = urmator;
            editor.setValue(dateiFisiere.get(urmator));
        }
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    function reseteazaImplicit() {
        dateiFisiere.clear();
        tabluriDeschise.clear();
        dateiFisiere.set(limbajCurent.fisierPrincipal, limbajCurent.hello);
        tabluriDeschise.add(limbajCurent.fisierPrincipal);
        fisierActiv = limbajCurent.fisierPrincipal;
        editor.setValue(limbajCurent.hello);
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    // ── DRAG & DROP TABURI ───────────────────────────────────────
    // Browser-ul NU mută elementele DOM la drag singur, deci nu putem
    // citi ordinea din DOM după drop. În schimb, reținem care tab e
    // tras (tabTras) și pe care e eliberat (target), facem swap în
    // array-ul derivat din Set, reconstruim Set-ul și re-randăm.
    let tabTras = null;

    function activreazaDragPeTab(elementTab, numeFisier) {
        elementTab.setAttribute('draggable', 'true');

        elementTab.addEventListener('dragstart', e => {
            tabTras = numeFisier;
            // Setăm datele în eveniment pentru compatibilitate cross-browser
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', numeFisier);
            // Adăugăm clasa cu un mic delay ca tab-ul să fie vizibil în ghost-ul browserului
            setTimeout(() => elementTab.classList.add('tab-tras'), 0);
        });

        elementTab.addEventListener('dragend', () => {
            tabTras = null;
            elementTab.classList.remove('tab-tras');
            // Curățăm highlight-ul de pe orice tab rămas marcat
            containerTaburi.querySelectorAll('.tab-drop-target')
                           .forEach(t => t.classList.remove('tab-drop-target'));
        });

        elementTab.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (tabTras && tabTras !== numeFisier)
                elementTab.classList.add('tab-drop-target');
        });

        elementTab.addEventListener('dragleave', () => {
            elementTab.classList.remove('tab-drop-target');
        });

        elementTab.addEventListener('drop', e => {
            e.preventDefault();
            elementTab.classList.remove('tab-drop-target');
            if (!tabTras || tabTras === numeFisier) return;

            // Convertim Set-ul în array, facem swap, reconstruim Set-ul
            const ordine = [...tabluriDeschise];
            const iSursa = ordine.indexOf(tabTras);
            const iTarget = ordine.indexOf(numeFisier);
            if (iSursa === -1 || iTarget === -1) return;

            // Swap simplu între cele două poziții
            [ordine[iSursa], ordine[iTarget]] = [ordine[iTarget], ordine[iSursa]];

            // Reconstruim Set-ul în noua ordine (Set păstrează ordinea de inserție)
            tabluriDeschise.clear();
            ordine.forEach(nume => tabluriDeschise.add(nume));

            randeazaTaburi();
        });
    }

    // ── RANDARE TABURI ────────────────────────────────────────────
    function randeazaTaburi() {
        if (!containerTaburi) return;
        containerTaburi.innerHTML = '';

        tabluriDeschise.forEach(numeFisier => {
            const tab = document.createElement('div');
            tab.className = `tab ${numeFisier === fisierActiv ? 'activ' : ''}`;

            const eticheta = document.createElement('span');
            eticheta.textContent = numeFisier;

            const butonInchide = document.createElement('span');
            butonInchide.className = 'inchide-tab';
            butonInchide.innerHTML = '&times;';
            butonInchide.addEventListener('click', e => inchideTab(numeFisier, e));

            tab.appendChild(eticheta);
            tab.appendChild(butonInchide);
            tab.addEventListener('click', () => deschideFisier(numeFisier));

            // Activăm drag pe fiecare tab imediat după creare
            activreazaDragPeTab(tab, numeFisier);

            containerTaburi.appendChild(tab);
        });
    }

    // ── RANDARE FIȘIERE SIDEBAR ───────────────────────────────────
    function randeazaFisiereSidebar() {
        if (!listaFisiere) return;
        listaFisiere.innerHTML = '';

        dateiFisiere.forEach((_, numeFisier) => {
            const element = document.createElement('div');
            element.className = `element-fisier ${numeFisier === fisierActiv ? 'activ' : ''}`;

            const icona = document.createElement('i');
            icona.className = getIconaFisier(numeFisier.split('.').pop().toLowerCase());

            const eticheta = document.createElement('span');
            eticheta.className   = 'nume-fisier';
            eticheta.textContent = numeFisier;
            eticheta.title       = numeFisier;

            const butonSterge = document.createElement('span');
            butonSterge.className = 'sterge-fisier';
            butonSterge.innerHTML = '&times;';
            butonSterge.title     = 'Șterge din proiect';
            butonSterge.addEventListener('click', e => { e.stopPropagation(); stergeFisier(numeFisier); });

            element.appendChild(icona);
            element.appendChild(eticheta);
            element.appendChild(butonSterge);
            element.addEventListener('click', () => deschideFisier(numeFisier));
            listaFisiere.appendChild(element);
        });

        const panouFisiere = document.getElementById('panou-fisiere');
        if (esteDeschisFisiere() && panouFisiere)
            panouFisiere.style.maxHeight = panouFisiere.scrollHeight + 'px';
    }

    function getIconaFisier(extensie) {
        return {
            cpp: 'devicon-cplusplus-plain', c:   'devicon-c-plain',
            h:   'fa-solid fa-file-code',   hpp: 'fa-solid fa-file-code',
            py:  'devicon-python-plain',    java:'devicon-java-plain',
            rs:  'devicon-rust-plain',      js:  'devicon-javascript-plain',
        }[extensie] || 'fa-solid fa-file';
    }

    // ── RANDARE INIȚIALĂ ──────────────────────────────────────────
    randeazaTaburi();
    randeazaFisiereSidebar();
    adaugaOutput('Output-ul programului va apărea aici după Run.', 'astept');

    // ── SHORTCUT CTRL+S ──────────────────────────────────────────
    // Interceptăm Ctrl+S înainte ca browserul să deschidă dialogul de salvare
    document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // oprește salvarea paginii de către browser
        salveaza('fisier');
    }
});
});